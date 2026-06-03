import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject, optionalDateTime } from '@/lib/validation'
import { ensurePrimaryLocation } from '@/lib/examinations/auto-location'

const MAX_BATCH = 200

// ─── GET: list candidates for bulk scheduling ─────────────────────────────────
//
// mode=recalls  — pending/overdue recall obligations (periodic re-examinations)
// mode=employees — active employees with no scheduled/in_progress exam
//                  (first-time or freshly imported employees)

const BULK_HORIZONS = ['overdue', 'thisWeek', 'thisMonth', 'next30', 'next60', 'next90', 'all'] as const
type BulkHorizon = typeof BULK_HORIZONS[number]

function horizonDateRange(h: BulkHorizon): { from: Date | null; to: Date | null } {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const addDays = (d: number) => {
    const t = new Date(today)
    t.setUTCDate(today.getUTCDate() + d)
    return t
  }
  switch (h) {
    case 'overdue':   return { from: null,  to: today       }
    case 'thisWeek':  return { from: today, to: addDays(7)  }
    case 'thisMonth':
    case 'next30':    return { from: today, to: addDays(30) }
    case 'next60':    return { from: today, to: addDays(60) }
    case 'next90':    return { from: today, to: addDays(90) }
    case 'all':       return { from: null,  to: null        }
  }
}

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const mode            = sp.get('mode') === 'recalls' ? 'recalls' : 'employees'
  const companyId       = sp.get('companyId')        || null
  const workplaceId     = sp.get('workplaceId')      || null
  const department      = sp.get('department')       || null

  // ── employees mode ────────────────────────────────────────────────────────

  if (mode === 'employees') {
    if (!companyId) return NextResponse.json({ error: 'companyId_required' }, { status: 400 })

    const empWhere: Prisma.EmployeeWhereInput = {
      tenantId: auth.user.tenantId,
      companyId,
      isActive: true,
      deletedAt: null,
      archivedAt: null,
    }

    if (workplaceId || department) {
      empWhere.workplaceAssignments = {
        some: {
          isCurrent: true,
          ...(workplaceId ? { workplaceId } : {}),
          ...(department  ? { workplace: { department } } : {}),
        },
      }
    }

    const employees = await prisma.employee.findMany({
      where: empWhere,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyEmployeeId: true,
        jobTitle: true,
        company: { select: { id: true, name: true } },
        workplaceAssignments: {
          where: { isCurrent: true },
          orderBy: { startDate: 'desc' },
          take: 1,
          select: {
            workplace: {
              select: { id: true, name: true, department: true },
            },
          },
        },
      },
    })

    // Exclude employees who already have a scheduled/in_progress exam
    const empIds = employees.map((e) => e.id)
    const activeExamSet = new Set<string>()
    if (empIds.length > 0) {
      const activeExams = await prisma.examination.findMany({
        where: {
          tenantId: auth.user.tenantId,
          employeeId: { in: empIds },
          status: { in: ['scheduled', 'in_progress'] },
          deletedAt: null,
        },
        select: { employeeId: true },
      })
      for (const e of activeExams) activeExamSet.add(e.employeeId)
    }

    const filtered = employees.filter((e) => !activeExamSet.has(e.id))

    // Derive filter metadata from result set
    const workplacesMap  = new Map<string, string>()
    const departmentsSet = new Set<string>()
    for (const e of filtered) {
      const wp = e.workplaceAssignments[0]?.workplace
      if (wp) {
        workplacesMap.set(wp.id, wp.name)
        if (wp.department) departmentsSet.add(wp.department)
      }
    }

    const companyName = filtered[0]?.company?.name ?? ''
    const result = filtered.map((e) => {
      const wp = e.workplaceAssignments[0]?.workplace ?? null
      return {
        id:                  e.id,
        employeeId:          e.id,
        employeeName:        `${e.lastName} ${e.firstName}`,
        companyEmployeeId:   e.companyEmployeeId,
        jobTitle:            e.jobTitle,
        companyId,
        companyName:         e.company?.name ?? companyName,
        workplaceId:         wp?.id   ?? null,
        workplaceName:       wp?.name ?? null,
        department:          wp?.department ?? null,
        examinationTypeId:   null,
        examinationTypeName: null,
        dueDate:             null,
        status:              'no_examination' as const,
        daysOverdue:         null,
        hasConflict:         false,
        hasNoWorkplace:      wp === null,
      }
    })

    return NextResponse.json({
      recalls: result,
      total: result.length,
      employeesWithoutWorkplace: result.filter((r) => r.hasNoWorkplace).length,
      filters: {
        companies:        e_company_filters(filtered),
        workplaces:       Array.from(workplacesMap.entries()).map(([id, name]) => ({ id, name })),
        departments:      Array.from(departmentsSet).sort(),
        examinationTypes: [],
      },
    })
  }

  // ── recalls mode ──────────────────────────────────────────────────────────

  const examinationTypeId = sp.get('examinationTypeId') || null
  const horizonRaw        = sp.get('horizon') ?? 'all'
  const horizon           = (BULK_HORIZONS as readonly string[]).includes(horizonRaw)
    ? (horizonRaw as BulkHorizon) : 'all'

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const { from, to } = horizonDateRange(horizon)
  const dueDateWhere: Prisma.RecallWhereInput =
    from && to  ? { dueDate: { gte: from, lt: to } } :
    from        ? { dueDate: { gte: from } } :
    to          ? { dueDate: { lt: to } }    : {}

  const workplaceWhere: Prisma.WorkplaceWhereInput = { deletedAt: null }
  if (companyId)   workplaceWhere.companyId  = companyId
  if (department)  workplaceWhere.department = department

  const statusWhere: Prisma.RecallWhereInput =
    horizon === 'overdue'
      ? { status: 'overdue' }
      : { status: { in: ['pending', 'overdue'] } }

  const rawRecalls = await prisma.recall.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      ...statusWhere,
      ...dueDateWhere,
      ...(workplaceId       ? { workplaceId }       : {}),
      ...(examinationTypeId ? { examinationTypeId } : {}),
      workplace: workplaceWhere,
      OR: [
        { createdFromExaminationId: null },
        { createdFromExamination: { deletedAt: null } },
      ],
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 2000,
    select: {
      id: true,
      status: true,
      dueDate: true,
      examinationTypeId: true,
      workplaceId: true,
      employeeId: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyEmployeeId: true,
          jobTitle: true,
          archivedAt: true,
        },
      },
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: { select: { id: true, nameRo: true } },
    },
  })

  const recalls = rawRecalls.filter((r) => r.employee.archivedAt === null)

  const empIds2 = [...new Set(recalls.map((r) => r.employee.id))]
  const conflictSet = new Set<string>()
  if (empIds2.length > 0) {
    const conflicts = await prisma.examination.findMany({
      where: {
        tenantId: auth.user.tenantId,
        employeeId: { in: empIds2 },
        status: { in: ['scheduled', 'in_progress'] },
        deletedAt: null,
      },
      select: { employeeId: true },
    })
    for (const c of conflicts) conflictSet.add(c.employeeId)
  }

  const companiesMap   = new Map<string, string>()
  const workplacesMap2 = new Map<string, string>()
  const departmentsSet2 = new Set<string>()
  const examTypesMap   = new Map<string, string>()
  for (const r of recalls) {
    companiesMap.set(r.workplace.company.id, r.workplace.company.name)
    workplacesMap2.set(r.workplace.id, r.workplace.name)
    if (r.workplace.department) departmentsSet2.add(r.workplace.department)
    examTypesMap.set(r.examinationType.id, r.examinationType.nameRo)
  }

  const todayMs = today.getTime()
  const result = recalls.map((r) => ({
    id:                  r.id,
    employeeId:          r.employee.id,
    employeeName:        `${r.employee.lastName} ${r.employee.firstName}`,
    companyEmployeeId:   r.employee.companyEmployeeId,
    jobTitle:            r.employee.jobTitle,
    companyId:           r.workplace.company.id,
    companyName:         r.workplace.company.name,
    workplaceId:         r.workplace.id,
    workplaceName:       r.workplace.name,
    department:          r.workplace.department,
    examinationTypeId:   r.examinationType.id,
    examinationTypeName: r.examinationType.nameRo,
    dueDate:             r.dueDate.toISOString().slice(0, 10),
    status:              r.status as 'pending' | 'overdue',
    daysOverdue:         r.dueDate.getTime() < todayMs
      ? Math.round((todayMs - r.dueDate.getTime()) / 86_400_000)
      : null,
    hasConflict:         conflictSet.has(r.employee.id),
  }))

  return NextResponse.json({
    recalls: result,
    total: result.length,
    filters: {
      companies:        Array.from(companiesMap.entries()).map(([id, name]) => ({ id, name })),
      workplaces:       Array.from(workplacesMap2.entries()).map(([id, name]) => ({ id, name })),
      departments:      Array.from(departmentsSet2).sort(),
      examinationTypes: Array.from(examTypesMap.entries()).map(([id, name]) => ({ id, name })),
    },
  })
}

// Helper: derive distinct companies from employee result set
function e_company_filters(
  employees: Array<{ company: { id: string; name: string } | null }>
): Array<{ id: string; name: string }> {
  const map = new Map<string, string>()
  for (const e of employees) {
    if (e.company) map.set(e.company.id, e.company.name)
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
}

// ─── POST: create examinations from bulk schedule ─────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const body = asObject(raw) ?? {}
  const itemsInput = Array.isArray(body.items) ? body.items : []

  if (itemsInput.length === 0) {
    return NextResponse.json({ error: 'validation_failed', issues: ['items is empty'] }, { status: 400 })
  }
  if (itemsInput.length > MAX_BATCH) {
    return NextResponse.json({ error: 'too_many_items', max: MAX_BATCH }, { status: 400 })
  }

  // mode: detect from body or from first item shape
  const bodyMode = typeof body.mode === 'string' ? body.mode : null
  const firstItem = asObject(itemsInput[0]) ?? {}
  const mode: 'recalls' | 'employees' =
    bodyMode === 'employees' || (!bodyMode && typeof firstItem.employeeId === 'string')
      ? 'employees'
      : 'recalls'

  // Resolve practitioner
  const rawPracId = typeof body.practitionerId === 'string' ? body.practitionerId.trim() : null
  let practitionerId: string | null = rawPracId
  if (!practitionerId) {
    if (auth.user.roles.includes('practitioner') || auth.user.roles.includes('practice_admin')) {
      practitionerId = auth.user.id
    } else {
      return NextResponse.json(
        { error: 'validation_failed', issues: ['practitionerId is required'] },
        { status: 400 }
      )
    }
  }

  const practitioner = await prisma.user.findFirst({
    where: {
      id: practitionerId,
      tenantId: auth.user.tenantId,
      isActive: true,
      deletedAt: null,
      roles: { hasSome: ['practitioner', 'practice_admin'] },
    },
    select: { id: true },
  })
  if (!practitioner) return NextResponse.json({ error: 'practitioner_not_found' }, { status: 404 })

  const locationId = await ensurePrimaryLocation(auth.user.tenantId, 'Sediu principal')

  // ── employees mode ────────────────────────────────────────────────────────

  if (mode === 'employees') {
    interface EmployeeItem {
      employeeId: string
      scheduledAt: Date | null
      examinationTypeId: string
      workplaceId: string | null
    }
    const parseIssues: string[] = []
    const empItems: EmployeeItem[] = []

    for (let i = 0; i < itemsInput.length; i++) {
      const r = asObject(itemsInput[i]) ?? {}
      const employeeId = typeof r.employeeId === 'string' ? r.employeeId.trim() : null
      if (!employeeId) { parseIssues.push(`item[${i}]: employeeId is required`); continue }
      const examinationTypeId = typeof r.examinationTypeId === 'string' ? r.examinationTypeId.trim() : null
      if (!examinationTypeId) { parseIssues.push(`item[${i}]: examinationTypeId is required`); continue }
      const workplaceIdRaw = typeof r.workplaceId === 'string' ? r.workplaceId.trim() : null
      let scheduledAt: Date | null = null
      if (r.scheduledAt) {
        const parsed = optionalDateTime(`item[${i}].scheduledAt`, r.scheduledAt, parseIssues)
        if (parsed) scheduledAt = parsed
      }
      empItems.push({ employeeId, scheduledAt, examinationTypeId, workplaceId: workplaceIdRaw })
    }
    if (parseIssues.length > 0) {
      return NextResponse.json({ error: 'validation_failed', issues: parseIssues }, { status: 400 })
    }

    const results: Array<{ itemId: string; outcome: 'created' | 'failed'; examinationId?: string; reason?: string }> = []
    let created = 0
    let failed = 0

    for (const item of empItems) {
      try {
        const employee = await prisma.employee.findFirst({
          where: {
            id: item.employeeId,
            tenantId: auth.user.tenantId,
            isActive: true,
            deletedAt: null,
            archivedAt: null,
          },
          select: { id: true },
        })
        if (!employee) {
          results.push({ itemId: item.employeeId, outcome: 'failed', reason: 'employee_not_found' })
          failed++; continue
        }

        const examType = await prisma.examinationType.findFirst({
          where: { id: item.examinationTypeId, isActive: true },
          select: { id: true },
        })
        if (!examType) {
          results.push({ itemId: item.employeeId, outcome: 'failed', reason: 'exam_type_inactive' })
          failed++; continue
        }

        // Resolve workplace: use provided, or fall back to current assignment
        let resolvedWorkplaceId: string | null = item.workplaceId
        if (!resolvedWorkplaceId) {
          const assignment = await prisma.employeeWorkplaceAssignment.findFirst({
            where: { employeeId: item.employeeId, tenantId: auth.user.tenantId, isCurrent: true },
            orderBy: { startDate: 'desc' },
            select: { workplaceId: true },
          })
          resolvedWorkplaceId = assignment?.workplaceId ?? null
        }
        if (!resolvedWorkplaceId) {
          results.push({ itemId: item.employeeId, outcome: 'failed', reason: 'no_workplace' })
          failed++; continue
        }

        const workplace = await prisma.workplace.findFirst({
          where: { id: resolvedWorkplaceId, tenantId: auth.user.tenantId, isActive: true, deletedAt: null },
          select: { id: true },
        })
        if (!workplace) {
          results.push({ itemId: item.employeeId, outcome: 'failed', reason: 'workplace_unavailable' })
          failed++; continue
        }

        const exam = await prisma.$transaction(async (tx) =>
          createExaminationWithNumberInTx(tx, auth.user!.tenantId!, (n) => ({
            tenant:          { connect: { id: auth.user!.tenantId! } },
            employee:        { connect: { id: item.employeeId } },
            workplace:       { connect: { id: workplace.id } },
            examinationType: { connect: { id: examType.id } },
            practitioner:    { connect: { id: practitioner.id } },
            location:        { connect: { id: locationId } },
            examinationNumber:   n.number,
            examinationYear:     n.year,
            examinationSequence: n.sequence,
            scheduledAt: item.scheduledAt,
            status: 'scheduled',
            requestSource: 'periodic_due',
            notes: `Created via bulk employee schedule`,
          }))
        )

        results.push({ itemId: item.employeeId, outcome: 'created', examinationId: exam.id })
        created++
      } catch (err) {
        console.error('[bulk-schedule/employees] item failed', {
          employeeId: item.employeeId,
          error: (err as Error).message,
        })
        results.push({ itemId: item.employeeId, outcome: 'failed', reason: 'unexpected_error' })
        failed++
      }
    }

    return NextResponse.json({ summary: { total: empItems.length, created, failed }, results })
  }

  // ── recalls mode ──────────────────────────────────────────────────────────

  interface RecallItem {
    recallId: string
    scheduledAt: Date | null
  }
  const parseIssues: string[] = []
  const items: RecallItem[] = []
  for (let i = 0; i < itemsInput.length; i++) {
    const r = asObject(itemsInput[i]) ?? {}
    const recallId = typeof r.recallId === 'string' ? r.recallId.trim() : null
    if (!recallId) { parseIssues.push(`item[${i}]: recallId is required`); continue }
    let scheduledAt: Date | null = null
    if (r.scheduledAt) {
      const parsed = optionalDateTime(`item[${i}].scheduledAt`, r.scheduledAt, parseIssues)
      if (parsed) scheduledAt = parsed
    }
    items.push({ recallId, scheduledAt })
  }
  if (parseIssues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues: parseIssues }, { status: 400 })
  }

  const results: Array<{
    itemId: string
    recallId: string  // kept for backward compat
    outcome: 'created' | 'failed'
    examinationId?: string
    reason?: string
  }> = []
  let created = 0
  let failed = 0

  for (const item of items) {
    try {
      const recall = await prisma.recall.findFirst({
        where: { id: item.recallId, tenantId: auth.user.tenantId, deletedAt: null },
        include: {
          employee:        { select: { id: true, archivedAt: true, deletedAt: true } },
          workplace:       { select: { id: true, isActive: true, deletedAt: true } },
          examinationType: { select: { id: true, isActive: true } },
        },
      })

      if (!recall) {
        results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: 'recall_not_found' })
        failed++; continue
      }
      if (recall.status === 'completed' || recall.status === 'cancelled') {
        results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: `already_${recall.status}` })
        failed++; continue
      }
      if (recall.employee.archivedAt || recall.employee.deletedAt) {
        results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: 'employee_unavailable' })
        failed++; continue
      }
      if (!recall.workplace.isActive || recall.workplace.deletedAt) {
        results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: 'workplace_unavailable' })
        failed++; continue
      }
      if (!recall.examinationType.isActive) {
        results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: 'exam_type_inactive' })
        failed++; continue
      }

      const exam = await prisma.$transaction(async (tx) => {
        const e = await createExaminationWithNumberInTx(
          tx,
          auth.user!.tenantId!,
          (n) => ({
            tenant:          { connect: { id: auth.user!.tenantId! } },
            employee:        { connect: { id: recall.employee.id } },
            workplace:       { connect: { id: recall.workplace.id } },
            examinationType: { connect: { id: recall.examinationType.id } },
            practitioner:    { connect: { id: practitioner.id } },
            location:        { connect: { id: locationId } },
            examinationNumber:   n.number,
            examinationYear:     n.year,
            examinationSequence: n.sequence,
            scheduledAt: item.scheduledAt,
            status: 'scheduled',
            requestSource: 'periodic_due',
            notes: `Created from recall ${recall.id} (batch schedule)`,
          })
        )
        await tx.recall.update({
          where: { id: recall.id },
          data: { status: 'completed', completedExaminationId: e.id },
        })
        return e
      })

      results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'created', examinationId: exam.id })
      created++
    } catch (err) {
      console.error('[bulk-schedule] item failed', { recallId: item.recallId, error: (err as Error).message })
      results.push({ itemId: item.recallId, recallId: item.recallId, outcome: 'failed', reason: 'unexpected_error' })
      failed++
    }
  }

  return NextResponse.json({ summary: { total: items.length, created, failed }, results })
}

// ─── Transaction-aware examination numbering ──────────────────────────────────

async function createExaminationWithNumberInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  buildData: (n: { year: number; sequence: number; number: string }) => Prisma.ExaminationCreateInput
): Promise<{ id: string }> {
  const MAX_RETRIES = 5
  const year = new Date().getUTCFullYear()
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const highest = await tx.examination.findFirst({
      where: { tenantId, examinationYear: year },
      orderBy: { examinationSequence: 'desc' },
      select: { examinationSequence: true },
    })
    const sequence = (highest?.examinationSequence ?? 0) + 1
    const number = `${year}/${String(sequence).padStart(4, '0')}`
    try {
      return await tx.examination.create({
        data: buildData({ year, sequence, number }),
        select: { id: true },
      })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2002') continue
      throw err
    }
  }
  throw new Error('Could not allocate examination number after 5 retries')
}

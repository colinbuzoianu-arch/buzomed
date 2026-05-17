import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject, optionalDateTime } from '@/lib/validation'
import { ensurePrimaryLocation } from '@/lib/examinations/auto-location'

/**
 * Bulk-schedule examinations from a list of recalls.
 *
 * Each item maps one recall → one new Examination. The practitioner is
 * shared across all items (a batch is always one practitioner's session).
 * The scheduledAt per item may differ — the client sends pre-computed
 * slot times (startDate + 20-min intervals) so users can review before
 * confirming.
 *
 * Failure is per-item: if one recall is invalid (archived employee,
 * already completed, etc.) the rest still proceed. The caller receives
 * a per-item outcome report.
 *
 * Max 100 items per call to keep response times reasonable.
 */

const MAX_BATCH = 100

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
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
    return NextResponse.json(
      { error: 'validation_failed', issues: ['items is empty'] },
      { status: 400 }
    )
  }
  if (itemsInput.length > MAX_BATCH) {
    return NextResponse.json(
      { error: 'too_many_items', max: MAX_BATCH },
      { status: 400 }
    )
  }

  // Resolve practitioner — passed explicitly or defaults to the caller
  // if they are a practitioner.
  const rawPracId =
    typeof body.practitionerId === 'string' ? body.practitionerId.trim() : null
  let practitionerId: string | null = rawPracId
  if (!practitionerId) {
    if (
      auth.user.roles.includes('practitioner') ||
      auth.user.roles.includes('practice_admin')
    ) {
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
  if (!practitioner) {
    return NextResponse.json({ error: 'practitioner_not_found' }, { status: 404 })
  }

  // Parse and validate items
  interface Item {
    recallId: string
    scheduledAt: Date | null
  }
  const parseIssues: string[] = []
  const items: Item[] = []
  for (let i = 0; i < itemsInput.length; i++) {
    const r = asObject(itemsInput[i]) ?? {}
    const recallId =
      typeof r.recallId === 'string' ? r.recallId.trim() : null
    if (!recallId) {
      parseIssues.push(`item[${i}]: recallId is required`)
      continue
    }
    let scheduledAt: Date | null = null
    if (r.scheduledAt) {
      const parsed = optionalDateTime(`item[${i}].scheduledAt`, r.scheduledAt, parseIssues)
      if (parsed) scheduledAt = parsed
    }
    items.push({ recallId, scheduledAt })
  }
  if (parseIssues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parseIssues },
      { status: 400 }
    )
  }

  const locationId = await ensurePrimaryLocation(
    auth.user.tenantId,
    'Sediu principal'
  )

  // Process items — per-item failure is isolated, like the import route.
  const results: Array<{
    recallId: string
    outcome: 'created' | 'failed'
    examinationId?: string
    reason?: string
  }> = []
  let created = 0
  let failed = 0

  for (const item of items) {
    try {
      const recall = await prisma.recall.findFirst({
        where: {
          id: item.recallId,
          tenantId: auth.user.tenantId,
          deletedAt: null,
        },
        include: {
          employee: { select: { id: true, archivedAt: true, deletedAt: true } },
          workplace: { select: { id: true, isActive: true, deletedAt: true } },
          examinationType: { select: { id: true, isActive: true } },
        },
      })

      if (!recall) {
        results.push({ recallId: item.recallId, outcome: 'failed', reason: 'recall_not_found' })
        failed++
        continue
      }
      if (recall.status === 'completed' || recall.status === 'cancelled') {
        results.push({ recallId: item.recallId, outcome: 'failed', reason: `already_${recall.status}` })
        failed++
        continue
      }
      if (recall.employee.archivedAt || recall.employee.deletedAt) {
        results.push({ recallId: item.recallId, outcome: 'failed', reason: 'employee_unavailable' })
        failed++
        continue
      }
      if (!recall.workplace.isActive || recall.workplace.deletedAt) {
        results.push({ recallId: item.recallId, outcome: 'failed', reason: 'workplace_unavailable' })
        failed++
        continue
      }
      if (!recall.examinationType.isActive) {
        results.push({ recallId: item.recallId, outcome: 'failed', reason: 'exam_type_inactive' })
        failed++
        continue
      }

      // Create exam + mark recall completed in one transaction
      const exam = await prisma.$transaction(async (tx) => {
        const e = await createExaminationWithNumberInTx(
          tx,
          auth.user!.tenantId!,
          (n) => ({
            tenant: { connect: { id: auth.user!.tenantId! } },
            employee: { connect: { id: recall.employee.id } },
            workplace: { connect: { id: recall.workplace.id } },
            examinationType: { connect: { id: recall.examinationType.id } },
            practitioner: { connect: { id: practitioner.id } },
            location: { connect: { id: locationId } },
            examinationNumber: n.number,
            examinationYear: n.year,
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

      results.push({ recallId: item.recallId, outcome: 'created', examinationId: exam.id })
      created++
    } catch (err) {
      console.error('[bulk-schedule] item failed', {
        recallId: item.recallId,
        error: (err as Error).message,
      })
      results.push({ recallId: item.recallId, outcome: 'failed', reason: 'unexpected_error' })
      failed++
    }
  }

  return NextResponse.json({
    summary: { total: items.length, created, failed },
    results,
  })
}

// ─── Transaction-aware examination numbering ─────────────────────────

async function createExaminationWithNumberInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  buildData: (n: {
    year: number
    sequence: number
    number: string
  }) => Prisma.ExaminationCreateInput
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

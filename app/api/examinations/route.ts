import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import type {
  ExaminationStatus,
  ExaminationRequestSource,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import { asObject, optionalString } from '@/lib/validation'
import { ensurePrimaryLocation } from '@/lib/examinations/auto-location'
import { createExaminationWithNumber } from '@/lib/examinations/numbering'

/**
 * Examinations live at the tenant level (not nested under employee or
 * company in the URL) because the common workflow is:
 *
 *   - cabinet manager looks at today's scheduled exams
 *   - practitioner browses by status across companies
 *   - reports query by date range, type, verdict
 *
 * Per-employee and per-workplace lists are derived views, surfaced on
 * the respective detail pages.
 *
 * Status workflow: scheduled → in_progress → completed (+ signed).
 * Alternates: scheduled → cancelled / no_show.
 */

const VALID_REQUEST_SOURCES: ExaminationRequestSource[] = [
  'employer_request',
  'periodic_due',
  'employee_request',
  'legal_obligation',
  'other',
]

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId) {
    return NextResponse.json(
      { error: 'no_tenant' },
      { status: 403 }
    )
  }
  if (!canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as ExaminationStatus | null

  const where: Prisma.ExaminationWhereInput = {
    tenantId: auth.user.tenantId,
    ...(status ? { status } : {}),
  }

  const examinations = await prisma.examination.findMany({
    where,
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: {
        select: { id: true, code: true, nameRo: true, nameEn: true },
      },
      practitioner: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  })

  return NextResponse.json({ examinations })
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400 }
    )
  }

  const issues: string[] = []

  if (typeof body.employeeId !== 'string' || !body.employeeId.trim()) {
    issues.push('employeeId is required')
  }
  if (typeof body.examinationTypeId !== 'string' || !body.examinationTypeId.trim()) {
    issues.push('examinationTypeId is required')
  }

  // Scheduled date is optional — exams can be created "right now" without
  // a future scheduled timestamp. Default to now() in that case.
  let scheduledAt: Date | null = null
  if (body.scheduledAt !== undefined && body.scheduledAt !== null && body.scheduledAt !== '') {
    if (typeof body.scheduledAt !== 'string') {
      issues.push('scheduledAt must be an ISO datetime string')
    } else {
      const parsed = new Date(body.scheduledAt)
      if (isNaN(parsed.getTime())) {
        issues.push('scheduledAt is not a valid ISO datetime')
      } else {
        scheduledAt = parsed
      }
    }
  }

  let requestSource: ExaminationRequestSource | undefined
  if (body.requestSource !== undefined && body.requestSource !== null) {
    if (
      typeof body.requestSource !== 'string' ||
      !VALID_REQUEST_SOURCES.includes(body.requestSource as ExaminationRequestSource)
    ) {
      issues.push(`requestSource must be one of: ${VALID_REQUEST_SOURCES.join(', ')}`)
    } else {
      requestSource = body.requestSource as ExaminationRequestSource
    }
  }

  const referringDocumentNumber = optionalString(
    'referringDocumentNumber',
    body.referringDocumentNumber,
    issues,
    { maxLength: 100 }
  )
  const notes = optionalString('notes', body.notes, issues, {
    maxLength: 4000,
  })

  // Practitioner: if not specified, default to the creating user IF they
  // are a practitioner. Otherwise must be specified.
  let practitionerId: string | undefined
  if (typeof body.practitionerId === 'string' && body.practitionerId.trim()) {
    practitionerId = body.practitionerId.trim()
  } else if (auth.user.roles.includes('practitioner')) {
    practitionerId = auth.user.id
  } else {
    issues.push('practitionerId is required (creator is not a practitioner)')
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  // Resolve and verify entities. All tenant-scoped.
  const [employee, examinationType, practitioner] = await Promise.all([
    prisma.employee.findFirst({
      where: {
        id: body.employeeId as string,
        tenantId: auth.user.tenantId,
        deletedAt: null,
      },
      include: {
        workplaceAssignments: {
          where: { isCurrent: true },
          select: {
            workplaceId: true,
            workplace: { select: { id: true, isActive: true } },
          },
        },
      },
    }),
    prisma.examinationType.findFirst({
      where: { id: body.examinationTypeId as string, isActive: true },
      select: { id: true, defaultValidityMonths: true },
    }),
    practitionerId
      ? prisma.user.findFirst({
          where: {
            id: practitionerId,
            tenantId: auth.user.tenantId,
            isActive: true,
            deletedAt: null,
            roles: { hasSome: ['practitioner', 'practice_admin'] },
          },
          select: { id: true, roles: true },
        })
      : null,
  ])

  if (!employee) {
    return NextResponse.json({ error: 'employee_not_found' }, { status: 404 })
  }
  if (employee.archivedAt) {
    return NextResponse.json(
      {
        error: 'employee_archived',
        message: 'Cannot schedule an examination for an archived employee.',
      },
      { status: 409 }
    )
  }
  if (!examinationType) {
    return NextResponse.json(
      { error: 'examination_type_not_found' },
      { status: 404 }
    )
  }
  if (!practitioner) {
    return NextResponse.json(
      { error: 'practitioner_not_found' },
      { status: 404 }
    )
  }
  // Schema requires practitionerId — confirm role is practitioner-capable.
  if (
    !practitioner.roles.includes('practitioner') &&
    !practitioner.roles.includes('practice_admin')
  ) {
    return NextResponse.json(
      {
        error: 'not_a_practitioner',
        message: 'Selected user does not have the practitioner role.',
      },
      { status: 400 }
    )
  }

  // Workplace: take the employee's current assignment. Refuse if none
  // — an exam requires a workplace per HG 355/2007.
  const currentAssignment = employee.workplaceAssignments[0]
  if (!currentAssignment || !currentAssignment.workplace.isActive) {
    return NextResponse.json(
      {
        error: 'no_current_workplace',
        message:
          'Employee has no active workplace assignment. Assign the employee to a workplace before scheduling an exam.',
      },
      { status: 409 }
    )
  }

  // Resolve the cabinet's primary location (auto-create on first use).
  const locationId = await ensurePrimaryLocation(
    auth.user.tenantId,
    'Sediu principal'
  )

  // Create with collision-safe numbering.
  const examination = await createExaminationWithNumber(
    auth.user.tenantId,
    (n) => ({
      tenant: { connect: { id: auth.user!.tenantId! } },
      employee: { connect: { id: employee.id } },
      workplace: { connect: { id: currentAssignment.workplace.id } },
      examinationType: { connect: { id: examinationType.id } },
      practitioner: { connect: { id: practitioner.id } },
      location: { connect: { id: locationId } },
      examinationNumber: n.number,
      examinationYear: n.year,
      examinationSequence: n.sequence,
      scheduledAt,
      status: 'scheduled',
      requestSource: requestSource ?? null,
      referringDocumentNumber: referringDocumentNumber ?? null,
      notes: notes ?? null,
    }),
    (created) => created
  )

  return NextResponse.json({ examination }, { status: 201 })
}

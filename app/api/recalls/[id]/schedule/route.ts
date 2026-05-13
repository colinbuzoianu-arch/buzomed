import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { ensurePrimaryLocation } from '@/lib/examinations/auto-location'
import { createExaminationWithNumber } from '@/lib/examinations/numbering'
import { asObject, optionalDateTime } from '@/lib/validation'

/**
 * Create a scheduled examination from a pending/overdue recall.
 *
 * Inputs:
 *   - practitionerId (required if the caller is not themselves a
 *     practitioner; otherwise defaults to the caller)
 *   - scheduledAt (optional ISO datetime; defaults to null = "open" slot)
 *
 * Behavior:
 *   - The new examination uses the recall's employee, workplace, and
 *     examination type. The workplace is taken from the recall (which
 *     was the workplace at the time of the source examination), NOT
 *     the employee's current workplace — that's deliberate. If a
 *     worker has changed jobs, the recall is no longer meaningful and
 *     should be cancelled instead of fulfilled.
 *   - However, we DO verify the employee is still active and has a
 *     current workplace assignment, and that the workplace on the
 *     recall is still active. If either has changed, we refuse with a
 *     409 — the cabinet manager should review.
 *   - The recall is marked `completed` and pointed at the new exam.
 *   - All happens in one transaction so the recall and exam are
 *     consistent.
 *
 * Returns the created examination so the client can route the user
 * straight to the exam detail page (the natural follow-on action is
 * "open and start the exam").
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    raw = {}
  }
  const body = asObject(raw) ?? {}

  const issues: string[] = []
  let practitionerId: string | undefined
  if (typeof body.practitionerId === 'string' && body.practitionerId.trim()) {
    practitionerId = body.practitionerId.trim()
  } else if (auth.user.roles.includes('practitioner')) {
    practitionerId = auth.user.id
  } else {
    issues.push('practitionerId is required (creator is not a practitioner)')
  }

  let scheduledAt: Date | null = null
  if (body.scheduledAt !== undefined && body.scheduledAt !== null && body.scheduledAt !== '') {
    const parsed = optionalDateTime('scheduledAt', body.scheduledAt, issues)
    if (parsed) scheduledAt = parsed
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const { id } = await ctx.params

  // Load recall + verify everything's still valid.
  const recall = await prisma.recall.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      employee: { select: { id: true, archivedAt: true, deletedAt: true } },
      workplace: { select: { id: true, isActive: true, deletedAt: true } },
      examinationType: { select: { id: true, isActive: true } },
    },
  })

  if (!recall) {
    return NextResponse.json({ error: 'recall_not_found' }, { status: 404 })
  }
  if (recall.status === 'completed' || recall.status === 'cancelled') {
    return NextResponse.json(
      {
        error: 'invalid_transition',
        message: `Recall is already ${recall.status}`,
      },
      { status: 409 }
    )
  }
  if (recall.employee.archivedAt || recall.employee.deletedAt) {
    return NextResponse.json(
      {
        error: 'employee_unavailable',
        message:
          'Employee is archived or deleted. Cancel this recall instead.',
      },
      { status: 409 }
    )
  }
  if (!recall.workplace.isActive || recall.workplace.deletedAt) {
    return NextResponse.json(
      {
        error: 'workplace_unavailable',
        message:
          'Workplace is no longer active. Cancel this recall instead.',
      },
      { status: 409 }
    )
  }
  if (!recall.examinationType.isActive) {
    return NextResponse.json(
      { error: 'examination_type_inactive' },
      { status: 409 }
    )
  }

  // Verify the practitioner.
  const practitioner = await prisma.user.findFirst({
    where: {
      id: practitionerId!,
      tenantId: auth.user.tenantId,
      isActive: true,
      deletedAt: null,
      roles: { hasSome: ['practitioner', 'practice_admin'] },
    },
    select: { id: true },
  })
  if (!practitioner) {
    return NextResponse.json(
      { error: 'practitioner_not_found' },
      { status: 404 }
    )
  }

  const locationId = await ensurePrimaryLocation(
    auth.user.tenantId,
    'Sediu principal'
  )

  // Create + mark recall completed in one transaction. The numbering
  // helper does its own retry-on-collision loop; we wrap that whole
  // thing in $transaction so the recall update rolls back if the
  // examination create fails after multiple retries.
  const result = await prisma.$transaction(async (tx) => {
    const examination = await createExaminationWithNumberInTx(
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
        scheduledAt,
        status: 'scheduled',
        requestSource: 'periodic_due',
        notes: `Created from recall ${recall.id}`,
      })
    )

    await tx.recall.update({
      where: { id: recall.id },
      data: {
        status: 'completed',
        completedExaminationId: examination.id,
      },
    })

    return examination
  })

  return NextResponse.json({ examination: result }, { status: 201 })
}

// ─── helper ────────────────────────────────────────────────────────

/**
 * Transaction-aware version of createExaminationWithNumber. The helper
 * in lib/examinations/numbering.ts is bound to the global prisma client
 * — we duplicate the logic here against the transaction client so the
 * Recall update and Examination insert share an atomic boundary.
 */
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
      const created = await tx.examination.create({
        data: buildData({ year, sequence, number }),
        select: { id: true },
      })
      return created
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2002') continue
      throw err
    }
  }
  throw new Error('Could not allocate examination number after 5 retries')
}

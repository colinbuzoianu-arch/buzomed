import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { computeNextExaminationDueDate } from '@/lib/examinations/recall'

/**
 * Sign an examination. This is the legal commitment point — fișa de
 * aptitudine becomes valid, the worker can take it to their employer,
 * and the record becomes immutable.
 *
 * Required state to sign:
 *   - status in {scheduled, in_progress, completed}
 *   - not already signed
 *   - verdict is set
 *   - if verdict is inapt_temporar, inaptTemporarUntil is set
 *
 * Side effects on sign:
 *   - signedAt = now()
 *   - signedByUserId = the signer
 *   - status = completed
 *   - completedAt = now() (if not already)
 *   - nextExaminationDueDate = computed if apt / apt_conditionat AND
 *     not already manually set by practitioner
 *
 * Authorization: only a user with practitioner OR practice_admin role
 * can sign. Assistant cannot. Ideally we'd also restrict to "the
 * assigned practitioner OR a delegated signer" but that's overkill
 * for MVP — any practitioner-capable user in the tenant can sign.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
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

  // Only practitioner / practice_admin can sign. canWriteTenantData
  // already includes practitioners + practice_admins, so any user
  // who passes that check is authorized for sign.

  const { id } = await ctx.params

  const existing = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      workplace: { select: { examinationIntervalMonths: true } },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (existing.signedAt) {
    return NextResponse.json(
      {
        error: 'already_signed',
        message: 'This examination is already signed.',
      },
      { status: 409 }
    )
  }

  // Pre-sign validation.
  const issues: string[] = []
  if (existing.status === 'cancelled' || existing.status === 'no_show') {
    issues.push(`Cannot sign an examination with status '${existing.status}'`)
  }
  if (!existing.verdict) {
    issues.push('verdict must be set before signing')
  }
  if (existing.verdict === 'inapt_temporar' && !existing.inaptTemporarUntil) {
    issues.push('inaptTemporarUntil is required when verdict is inapt_temporar')
  }
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'cannot_sign', issues },
      { status: 400 }
    )
  }

  const now = new Date()

  // Q4: auto-calculate nextExaminationDueDate if not already set.
  let nextDue = existing.nextExaminationDueDate
  if (!nextDue && existing.verdict) {
    nextDue = computeNextExaminationDueDate({
      verdict: existing.verdict,
      signedAt: now,
      workplaceIntervalMonths: existing.workplace.examinationIntervalMonths,
    })
  }

  const updated = await prisma.examination.update({
    where: { id },
    data: {
      signedAt: now,
      signedByUserId: auth.user.id,
      status: 'completed',
      completedAt: existing.completedAt ?? now,
      nextExaminationDueDate: nextDue,
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      examinationType: { select: { id: true, nameRo: true } },
    },
  })

  return NextResponse.json({ examination: updated })
}

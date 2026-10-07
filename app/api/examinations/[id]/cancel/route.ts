import { type NextRequest, NextResponse } from 'next/server'
import { getClientIp, writeAuditLog } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'

/**
 * Cancel a scheduled / in-progress examination.
 *
 * Two flavors:
 *   - reason='cancelled' — admin cancellation (rescheduled, etc.)
 *   - reason='no_show'   — worker didn't show up
 *
 * Both set status accordingly. The exam stays in the system (not
 * deleted) because the schedule slot itself is a real event that
 * happened, and cabinets sometimes invoice for no-shows.
 *
 * Signed exams cannot be cancelled.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
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
    raw = {}
  }
  const body = asObject(raw) ?? {}

  const reason = body.reason as string | undefined
  if (reason && reason !== 'cancelled' && reason !== 'no_show') {
    return NextResponse.json(
      { error: 'invalid_reason', message: "reason must be 'cancelled' or 'no_show'" },
      { status: 400 }
    )
  }

  const { id } = await ctx.params

  const existing = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      signedAt: true,
      examinationNumber: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (existing.signedAt) {
    return NextResponse.json({ error: 'already_signed' }, { status: 409 })
  }
  if (existing.status === 'cancelled' || existing.status === 'no_show') {
    return NextResponse.json(
      {
        error: 'invalid_transition',
        message: `Examination is already ${existing.status}`,
      },
      { status: 409 }
    )
  }

  const newStatus: 'cancelled' | 'no_show' = (reason as 'cancelled' | 'no_show') ?? 'cancelled'

  const updated = await prisma.examination.update({
    where: { id },
    data: { status: newStatus },
  })

  // The cancellation record goes to the audit log, which carries the actor,
  // timestamp and IP properly.
  //
  // This used to append `[timestamp] Status set to X by user <uuid>` to the
  // examination's `notes`, with a comment saying it was a stand-in "until
  // the real audit log is built". That log has existed for a while (sign,
  // revoke and the PDF routes all use it), so the stand-in was only still
  // writing machine stamps into a field the schema defines as the
  // practitioner's own internal notes. Historical rows keep whatever was
  // already appended to them — nothing rewrites past data.
  //
  // Guarded on its own: an audit-log failure must not make a completed
  // cancellation look like it failed to the caller.
  try {
    await writeAuditLog({
      tenantId: auth.user.tenantId,
      userId: auth.user.id,
      action: 'update',
      entityType: 'examination',
      entityId: id,
      entitySummary: `Examinare ${existing.examinationNumber} — ${existing.employee.lastName} ${existing.employee.firstName}: status ${newStatus === 'no_show' ? 'neprezentare' : 'anulată'}`,
      ipAddress: getClientIp(request),
    })
  } catch (auditErr) {
    console.error('[examinations/cancel] audit log write failed', {
      examinationId: id,
      newStatus,
      auditErr,
    })
  }

  return NextResponse.json({ examination: updated })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
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
    select: { id: true, status: true, signedAt: true, notes: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (existing.signedAt) {
    return NextResponse.json(
      { error: 'already_signed' },
      { status: 409 }
    )
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

  const newStatus: 'cancelled' | 'no_show' =
    (reason as 'cancelled' | 'no_show') ?? 'cancelled'

  // Append a cancellation note for audit trail until the real audit log
  // is built (later session).
  const stamp = new Date().toISOString()
  const cancellationNote = `[${stamp}] Status set to ${newStatus} by user ${auth.user.id}`
  const newNotes = existing.notes
    ? `${existing.notes}\n${cancellationNote}`
    : cancellationNote

  const updated = await prisma.examination.update({
    where: { id },
    data: {
      status: newStatus,
      notes: newNotes,
    },
  })

  return NextResponse.json({ examination: updated })
}

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'

/**
 * Mark a scheduled examination as in_progress. Sets startedAt.
 *
 * This is mostly a UX nicety — the cabinet can leave an exam "scheduled"
 * forever and just fill it in at the end; nothing in the data model
 * requires the in_progress state. But "click Start" gives the cabinet
 * a clear handoff moment and a startedAt timestamp for time tracking.
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

  const { id } = await ctx.params

  const existing = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, status: true, signedAt: true, startedAt: true },
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
  if (existing.status !== 'scheduled' && existing.status !== 'in_progress') {
    return NextResponse.json(
      {
        error: 'invalid_transition',
        message: `Cannot start an examination with status '${existing.status}'`,
      },
      { status: 409 }
    )
  }

  const updated = await prisma.examination.update({
    where: { id },
    data: {
      status: 'in_progress',
      startedAt: existing.startedAt ?? new Date(),
    },
  })

  return NextResponse.json({ examination: updated })
}

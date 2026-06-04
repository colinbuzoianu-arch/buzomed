import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const existing = await prisma.apiKey.findFirst({
    where: { id, tenantId: auth.user.tenantId },
    select: { id: true, revokedAt: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (existing.revokedAt) {
    return NextResponse.json({ error: 'already_revoked' }, { status: 409 })
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

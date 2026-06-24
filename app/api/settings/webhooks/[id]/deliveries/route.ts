import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
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

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, tenantId: auth.user.tenantId },
    select: { id: true },
  })
  if (!endpoint) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: id },
    orderBy: { attemptedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      event: true,
      responseStatus: true,
      responseBody: true,
      durationMs: true,
      success: true,
      attemptedAt: true,
    },
  })

  return NextResponse.json({ deliveries })
}

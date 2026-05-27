import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteClinical } from '@/lib/permissions/tenant-data'

interface Ctx { params: Promise<{ id: string; mid: string }> }

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { mid } = await ctx.params
  const ev = await prisma.medicalEvent.findFirst({
    where: { id: mid, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!ev) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.ithsReportFiled === 'boolean') data.ithsReportFiled = body.ithsReportFiled
  if (body.ithsReportNumber !== undefined) data.ithsReportNumber = body.ithsReportNumber || null

  await prisma.medicalEvent.update({ where: { id: mid }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { mid } = await ctx.params
  const ev = await prisma.medicalEvent.findFirst({
    where: { id: mid, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!ev) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.medicalEvent.update({ where: { id: mid }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteClinical } from '@/lib/permissions/tenant-data'

interface Ctx { params: Promise<{ id: string; vid: string }> }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { vid } = await ctx.params
  const v = await prisma.vaccination.findFirst({
    where: { id: vid, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!v) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.vaccination.update({ where: { id: vid }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

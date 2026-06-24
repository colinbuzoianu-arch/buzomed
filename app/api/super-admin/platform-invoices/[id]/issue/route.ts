import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('super_admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (invoice.status !== 'draft') return NextResponse.json({ error: 'not_draft' }, { status: 409 })

  const updated = await prisma.platformInvoice.update({
    where: { id },
    data: { status: 'issued', issuedAt: new Date() },
  })
  return NextResponse.json({ invoice: updated })
}

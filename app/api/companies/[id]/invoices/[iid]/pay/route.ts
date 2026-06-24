import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

interface RouteContext {
  params: Promise<{ id: string; iid: string }>
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: companyId, iid } = await ctx.params
  const invoice = await prisma.invoice.findFirst({
    where: { id: iid, companyId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (invoice.status !== 'issued' && invoice.status !== 'overdue')
    return NextResponse.json(
      { error: 'invalid_status', message: 'Only issued or overdue invoices can be marked as paid.' },
      { status: 409 }
    )

  const updated = await prisma.invoice.update({
    where: { id: iid },
    data: { status: 'paid', paidAt: new Date() },
  })

  return NextResponse.json({ invoice: updated })
}

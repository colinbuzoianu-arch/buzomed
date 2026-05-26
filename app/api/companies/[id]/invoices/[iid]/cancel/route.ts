import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

interface RouteContext {
  params: Promise<{ id: string; iid: string }>
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: companyId, iid } = await ctx.params

  const invoice = await prisma.invoice.findFirst({
    where: { id: iid, companyId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, status: true, invoiceNumber: true },
  })

  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Only issued or overdue invoices can be cancelled.
  // Drafts are deleted, paid invoices require a credit note (out of scope).
  if (!['issued', 'overdue'].includes(invoice.status)) {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: 'Only issued or overdue invoices can be cancelled. Drafts are deleted; paid invoices require a credit note.',
      },
      { status: 409 }
    )
  }

  const updated = await prisma.invoice.update({
    where: { id: iid },
    data: { status: 'cancelled' },
  })

  return NextResponse.json({ invoice: updated })
}

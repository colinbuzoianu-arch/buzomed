import { NextRequest, NextResponse } from 'next/server'
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
    select: { id: true, status: true, dueDate: true },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (invoice.status !== 'draft')
    return NextResponse.json(
      { error: 'invalid_status', message: 'Only draft invoices can be issued.' },
      { status: 409 }
    )

  const now = new Date()
  // Default due date: 30 days from issue date if not already set
  const dueDate =
    invoice.dueDate ??
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)

  const updated = await prisma.invoice.update({
    where: { id: iid },
    data: { status: 'issued', issuedAt: now, dueDate },
  })

  return NextResponse.json({ invoice: updated })
}

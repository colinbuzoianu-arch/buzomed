import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

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
  if (invoice.status !== 'issued' && invoice.status !== 'overdue') {
    return NextResponse.json({ error: 'can_only_cancel_issued_or_overdue' }, { status: 409 })
  }

  const updated = await prisma.platformInvoice.update({
    where: { id },
    data: { status: 'cancelled' },
  })

  const { ipAddress, userAgent } = getRequestMeta(_req)
  void writeAuditLog({
    tenantId: null,
    userId: auth.user.id,
    action: 'update',
    entityType: 'platform_invoice',
    entityId: id,
    entitySummary: updated.invoiceNumber,
    changes: { status: { from: invoice.status, to: 'cancelled' } },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ invoice: updated })
}

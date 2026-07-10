import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { generateUnsubscribeUrl } from '@/lib/email/suppression'
import { renderPaymentConfirmedEmail } from '@/lib/email/templates/platform-invoice/payment-confirmed'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('super_admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      total: true,
      currency: true,
      snapshotTenantName: true,
      snapshotTenantEmail: true,
      tenant: { select: { name: true, email: true } },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (invoice.status !== 'issued' && invoice.status !== 'overdue') {
    return NextResponse.json({ error: 'must_be_issued_or_overdue' }, { status: 409 })
  }

  const updated = await prisma.platformInvoice.update({
    where: { id },
    data: { status: 'paid', paidAt: new Date() },
  })

  // Don't block the response on email send — a transient failure here
  // shouldn't fail the payment-marking action itself.
  const recipientEmail = invoice.snapshotTenantEmail ?? invoice.tenant.email
  if (recipientEmail && updated.paidAt) {
    const content = renderPaymentConfirmedEmail({
      tenantName: invoice.snapshotTenantName ?? invoice.tenant.name,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total.toString(),
      currency: invoice.currency,
      paidAt: updated.paidAt,
      unsubscribeUrl: generateUnsubscribeUrl(recipientEmail),
    })
    void sendEmail({
      to: { email: recipientEmail, name: invoice.tenant.name },
      content,
      tenantId: updated.tenantId,
      tags: ['platform-invoice-paid'],
    })
  }

  const { ipAddress, userAgent } = getRequestMeta(_req)
  void writeAuditLog({
    tenantId: null,
    userId: auth.user.id,
    action: 'update',
    entityType: 'platform_invoice',
    entityId: id,
    entitySummary: updated.invoiceNumber,
    changes: { status: { from: invoice.status, to: 'paid' } },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ invoice: updated })
}

import { type NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { sendEmailWithAttachment } from '@/lib/email'
import { getPlatformIssuer } from '@/lib/platform/issuer'
import { PlatformInvoicePdfDocument } from '../pdf/platform-invoice-pdf-document'
import type { PlatformInvoicePdfData } from '../pdf/platform-invoice-pdf-document'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('super_admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      tenant: { select: { name: true, cui: true, addressLine1: true, city: true, email: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const recipientEmail = invoice.snapshotTenantEmail ?? invoice.tenant.email
  if (!recipientEmail) {
    return NextResponse.json(
      { error: 'no_recipient_email', message: 'Cabinetul nu are adresă de email configurată.' },
      { status: 422 }
    )
  }

  const data: PlatformInvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    subtotal: invoice.subtotal.toString(),
    vatRate: invoice.vatRate.toString(),
    vatAmount: invoice.vatAmount.toString(),
    total: invoice.total.toString(),
    currency: invoice.currency,
    vatExemptReason: invoice.vatExemptReason,
    notes: invoice.notes,
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
    tenant: {
      name: invoice.snapshotTenantName ?? invoice.tenant.name,
      cui: invoice.snapshotTenantCui ?? invoice.tenant.cui ?? null,
      address: invoice.snapshotTenantAddress ??
        ([invoice.tenant.addressLine1, invoice.tenant.city].filter(Boolean).join(', ') || null),
      email: recipientEmail,
    },
  }

  let pdfBuffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(createElement(PlatformInvoicePdfDocument, { data }) as any)
  } catch (err) {
    console.error('[platform-invoice-email] pdf render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  const issuer = getPlatformIssuer()
  const recipientName = invoice.snapshotTenantName ?? invoice.tenant.name
  const totalFormatted = `${Number(invoice.total).toFixed(2)} ${invoice.currency}`
  const dueFormatted = invoice.dueDate
    ? new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(invoice.dueDate)
    : null
  const filename = `factura_${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`

  const result = await sendEmailWithAttachment({
    to: { email: recipientEmail, name: recipientName },
    from: issuer.email ? { email: issuer.email, name: issuer.name } : undefined,
    replyTo: issuer.email ? { email: issuer.email, name: issuer.name } : undefined,
    content: {
      subject: `Factura ${invoice.invoiceNumber} — Buzomed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f1e3f;">
          <p style="font-size: 15px;">Buna ziua, ${recipientName},</p>
          <p>Va transmitem factura <strong>${invoice.invoiceNumber}</strong> in valoare de <strong>${totalFormatted}</strong>${dueFormatted ? `, cu scadenta pe <strong>${dueFormatted}</strong>` : ''}.</p>
          <p>Factura este atasata acestui email in format PDF.</p>
          ${invoice.notes ? `<p style="color: #475569; font-size: 14px; border-left: 3px solid #e2e8f0; padding-left: 10px; margin: 16px 0;">${invoice.notes}</p>` : ''}
          <p style="margin-top: 24px;">Cu stima,<br/><strong>${issuer.name}</strong>${issuer.phone ? `<br/>${issuer.phone}` : ''}${issuer.email ? `<br/>${issuer.email}` : ''}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
          <p style="font-size: 11px; color: #94a3b8;">Document generat de Buzomed · platforma de medicina a muncii</p>
        </div>
      `,
      text: `Buna ziua, ${recipientName},\n\nVa transmitem factura ${invoice.invoiceNumber} in valoare de ${totalFormatted}${dueFormatted ? `, cu scadenta pe ${dueFormatted}` : ''}.\n\nFactura este atasata acestui email in format PDF.\n\nCu stima,\n${issuer.name}`,
    },
    attachment: {
      content: Buffer.from(pdfBuffer).toString('base64'),
      name: filename,
    },
    tags: ['platform-invoice'],
  })

  if (!result.success) {
    console.error('[platform-invoice-email] send failed:', result.error)
    return NextResponse.json({ error: 'email_failed', message: 'Emailul nu a putut fi trimis.' }, { status: 500 })
  }

  const { ipAddress, userAgent } = getRequestMeta(_req)
  void writeAuditLog({
    tenantId: invoice.tenantId,
    userId: auth.user.id,
    action: 'update',
    entityType: 'platform_invoice',
    entityId: id,
    entitySummary: invoice.invoiceNumber,
    changes: { emailSent: true, recipient: recipientEmail },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ ok: true, messageId: result.messageId })
}

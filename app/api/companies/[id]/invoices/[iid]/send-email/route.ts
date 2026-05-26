import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { InvoicePdfDocument } from '../pdf/invoice-pdf-document'
import type { InvoicePdfData } from '../pdf/invoice-pdf-document'
import { sendEmailWithAttachment } from '@/lib/email'

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
    include: {
      company: {
        select: {
          name: true, cui: true, addressLine1: true, addressLine2: true,
          city: true, county: true,
          email: true,
          contactPersonName: true, contactPersonEmail: true,
        },
      },
      tenant: {
        select: {
          name: true, cui: true,
          addressLine1: true, addressLine2: true, city: true, county: true,
          phone: true, email: true,
        },
      },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Determine recipient — contactPersonEmail preferred, fallback to company email
  const recipientEmail = invoice.company.contactPersonEmail ?? invoice.company.email
  if (!recipientEmail) {
    return NextResponse.json(
      {
        error: 'no_recipient_email',
        message: 'Compania nu are adresă de email configurată. Adaugă un email de contact în fișa companiei.',
      },
      { status: 422 }
    )
  }

  const buildAddress = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(', ') || null

  const data: InvoicePdfData = {
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
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    tenant: {
      name: invoice.tenant.name,
      cui: invoice.tenant.cui ?? null,
      address: buildAddress(invoice.tenant.addressLine1, invoice.tenant.addressLine2, invoice.tenant.city, invoice.tenant.county),
      phone: invoice.tenant.phone ?? null,
      email: invoice.tenant.email ?? null,
    },
    company: {
      name: invoice.company.name,
      cui: invoice.company.cui ?? null,
      address: buildAddress(invoice.company.addressLine1, invoice.company.addressLine2, invoice.company.county),
      city: invoice.company.city ?? null,
      contactPersonName: invoice.company.contactPersonName ?? null,
      contactPersonEmail: invoice.company.contactPersonEmail ?? null,
    },
  }

  let pdfBuffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(createElement(InvoicePdfDocument, { data }) as any)
  } catch (err) {
    console.error('[invoice-email] pdf render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  const filename = `factura_${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`
  const recipientName = invoice.company.contactPersonName ?? invoice.company.name
  const totalFormatted = `${Number(invoice.total).toFixed(2)} ${invoice.currency}`
  const dueFormatted = invoice.dueDate
    ? new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(invoice.dueDate)
    : null

  const result = await sendEmailWithAttachment({
    to: { email: recipientEmail, name: recipientName },
    replyTo: invoice.tenant.email
      ? { email: invoice.tenant.email, name: invoice.tenant.name }
      : undefined,
    content: {
      subject: `Factură ${invoice.invoiceNumber} — ${invoice.tenant.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f1e3f;">
          <p style="font-size: 15px;">Bună ziua${recipientName ? `, ${recipientName}` : ''},</p>
          <p>Vă transmitem factura <strong>${invoice.invoiceNumber}</strong> în valoare de <strong>${totalFormatted}</strong>${dueFormatted ? `, cu scadența pe <strong>${dueFormatted}</strong>` : ''}.</p>
          <p>Factura este atașată acestui email în format PDF.</p>
          ${invoice.notes ? `<p style="color: #475569; font-size: 14px; border-left: 3px solid #e2e8f0; padding-left: 10px; margin: 16px 0;">${invoice.notes}</p>` : ''}
          <p style="margin-top: 24px;">Cu stimă,<br/><strong>${invoice.tenant.name}</strong>${invoice.tenant.phone ? `<br/>${invoice.tenant.phone}` : ''}${invoice.tenant.email ? `<br/>${invoice.tenant.email}` : ''}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
          <p style="font-size: 11px; color: #94a3b8;">Document generat de Buzomed · platforma de medicina muncii</p>
        </div>
      `,
      text: `Bună ziua${recipientName ? `, ${recipientName}` : ''},\n\nVă transmitem factura ${invoice.invoiceNumber} în valoare de ${totalFormatted}${dueFormatted ? `, cu scadența pe ${dueFormatted}` : ''}.\n\nFactura este atașată acestui email în format PDF.\n\nCu stimă,\n${invoice.tenant.name}`,
    },
    attachment: {
      content: Buffer.from(pdfBuffer).toString('base64'),
      name: filename,
    },
    tags: ['invoice', 'buzomed'],
  })

  if (!result.success) {
    console.error('[invoice-email] send failed:', result.error)
    return NextResponse.json(
      { error: 'email_failed', message: 'Emailul nu a putut fi trimis. Verifică configurația Brevo.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, messageId: result.messageId })
}

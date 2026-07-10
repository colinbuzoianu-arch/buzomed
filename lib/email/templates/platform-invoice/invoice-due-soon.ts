import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface InvoiceDueSoonParams {
  tenantName: string
  invoiceNumber: string
  total: string
  currency: string
  dueDate: Date
  billingUrl: string
  unsubscribeUrl: string
}

export function renderInvoiceDueSoonEmail(params: InvoiceDueSoonParams): { subject: string; html: string; text: string } {
  const amount = `${Number(params.total).toFixed(2)} ${params.currency}`
  const dueDateStr = params.dueDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
  const subject = `Factura ${params.invoiceNumber} este scadentă în curând`

  const body = `
<p>Bună ziua,</p>
<p>Factura <strong>${escapeHtml(params.invoiceNumber)}</strong> pentru <strong>${escapeHtml(params.tenantName)}</strong>, în valoare de <strong>${escapeHtml(amount)}</strong>, este scadentă pe <strong>${escapeHtml(dueDateStr)}</strong>.</p>
<p>Te rugăm să o achiți până la această dată. Poți consulta detaliile și descărca factura din contul tău.</p>
${renderButton('Vezi facturile', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai efectuat deja plata, poți ignora acest mesaj.</p>
`

  const html = renderEmailLayout({
    preheader: `Factura ${params.invoiceNumber} (${amount}) este scadentă pe ${dueDateStr}.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
    unsubscribeUrl: params.unsubscribeUrl,
  })

  const text = `Bună ziua,\n\nFactura ${params.invoiceNumber} pentru ${params.tenantName} (${amount}) este scadentă pe ${dueDateStr}.\n\nVezi facturile: ${params.billingUrl}\n\nDezabonează-te: ${params.unsubscribeUrl}\n\nBuzomed`

  return { subject, html, text }
}

import { renderEmailLayout, escapeHtml } from '../layout'

interface PaymentConfirmedParams {
  tenantName: string
  invoiceNumber: string
  total: string
  currency: string
  paidAt: Date
  unsubscribeUrl: string
}

// Short confirmation only — no PDF attached, the recipient already got the
// invoice PDF via the existing send-email flow when it was issued.
export function renderPaymentConfirmedEmail(params: PaymentConfirmedParams): { subject: string; html: string; text: string } {
  const amount = `${Number(params.total).toFixed(2)} ${params.currency}`
  const paidAtStr = params.paidAt.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
  const subject = `Am primit plata pentru factura ${params.invoiceNumber}`

  const body = `
<p>Bună ziua,</p>
<p>Confirmăm primirea plății pentru factura <strong>${escapeHtml(params.invoiceNumber)}</strong> (${escapeHtml(params.tenantName)}), în valoare de <strong>${escapeHtml(amount)}</strong>, încasată pe <strong>${escapeHtml(paidAtStr)}</strong>.</p>
<p>Îți mulțumim!</p>
`

  const html = renderEmailLayout({
    preheader: `Plata pentru factura ${params.invoiceNumber} (${amount}) a fost confirmată.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
    unsubscribeUrl: params.unsubscribeUrl,
  })

  const text = `Bună ziua,\n\nConfirmăm primirea plății pentru factura ${params.invoiceNumber} (${params.tenantName}), ${amount}, încasată pe ${paidAtStr}.\n\nÎți mulțumim!\n\nDezabonează-te: ${params.unsubscribeUrl}\n\nBuzomed`

  return { subject, html, text }
}

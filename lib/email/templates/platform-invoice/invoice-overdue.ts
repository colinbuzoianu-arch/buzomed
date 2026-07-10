import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface InvoiceOverdueParams {
  tenantName: string
  invoiceNumber: string
  total: string
  currency: string
  dueDate: Date | null
  daysPastDue: number
  billingUrl: string
  unsubscribeUrl: string
}

// Factual, courtesy tone — small B2B market, "ai uitat probabil" not
// "veți fi penalizat". Sent on day 0 of overdue status, then every ~7 days,
// capped at 3 total sends (see cron/subscription-check).
export function renderInvoiceOverdueEmail(params: InvoiceOverdueParams): { subject: string; html: string; text: string } {
  const amount = `${Number(params.total).toFixed(2)} ${params.currency}`
  const dueDateStr = params.dueDate
    ? params.dueDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const subject = `Factura ${params.invoiceNumber} este restantă`

  const body = `
<p>Bună ziua,</p>
<p>Factura <strong>${escapeHtml(params.invoiceNumber)}</strong> pentru <strong>${escapeHtml(params.tenantName)}</strong>, în valoare de <strong>${escapeHtml(amount)}</strong>, avea scadența pe <strong>${escapeHtml(dueDateStr)}</strong> și este restantă de <strong>${params.daysPastDue} zile</strong>.</p>
<p>Probabil a scăpat printre altele — te rugăm să o achiți cât mai curând sau să ne contactezi dacă există o problemă.</p>
${renderButton('Vezi factura', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Întrebări sau nelămuriri? Scrie-ne la hello@buzomed.com.</p>
`

  const html = renderEmailLayout({
    preheader: `Factura ${params.invoiceNumber} (${amount}) este restantă de ${params.daysPastDue} zile.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
    unsubscribeUrl: params.unsubscribeUrl,
  })

  const text = `Bună ziua,\n\nFactura ${params.invoiceNumber} pentru ${params.tenantName} (${amount}, scadentă ${dueDateStr}) este restantă de ${params.daysPastDue} zile.\n\nVezi factura: ${params.billingUrl}\n\nDezabonează-te: ${params.unsubscribeUrl}\n\nBuzomed`

  return { subject, html, text }
}

import { renderEmailLayout, escapeHtml } from '../layout'

interface MissingInvoiceTenant {
  tenantId: string
  tenantName: string
  /** e.g. "pro" for flat billing, or "usage — 5 RON/consultație" */
  billingLabel: string
  superAdminUrl: string
}

interface AdminMonthlyInvoiceReminderParams {
  periodLabel: string // e.g. "iunie 2026"
  tenants: MissingInvoiceTenant[]
}

// Internal checklist, sent to hello@buzomed.com only when the list is
// non-empty — no "nothing to do" noise every month.
export function renderAdminMonthlyInvoiceReminderEmail(
  params: AdminMonthlyInvoiceReminderParams
): { subject: string; html: string; text: string } {
  const subject = `[Buzomed Admin] ${params.tenants.length} cabinete fără factură pentru ${params.periodLabel}`

  const rows = params.tenants
    .map(
      (t) => `
  <tr>
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb;">${escapeHtml(t.tenantName)}</td>
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb;">${escapeHtml(t.billingLabel)}</td>
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb; text-align: right;">
      <a href="${escapeHtml(t.superAdminUrl)}" style="color: #1d4f99;">Deschide</a>
    </td>
  </tr>`
    )
    .join('')

  const body = `
<p>Alertă automată Buzomed:</p>
<p>Următoarele cabinete active nu au încă o factură generată pentru <strong>${escapeHtml(params.periodLabel)}</strong>:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  <tr style="background-color: #f3f4f6;">
    <th style="padding: 8px 12px; text-align: left; font-size: 13px;">Cabinet</th>
    <th style="padding: 8px 12px; text-align: left; font-size: 13px;">Facturare</th>
    <th style="padding: 8px 12px; text-align: right; font-size: 13px;"></th>
  </tr>${rows}
</table>
<p style="font-size: 13px; color: #6b7280;">Verifică fiecare cabinet și generează factura din pagina lui (secțiunea "Facturare platformă").</p>
`

  const html = renderEmailLayout({
    preheader: `${params.tenants.length} cabinete fără factură pentru ${params.periodLabel}.`,
    body,
    footerText: 'Buzomed · Alertă internă · hello@buzomed.com',
  })

  const textRows = params.tenants
    .map((t) => `- ${t.tenantName} (${t.billingLabel}): ${t.superAdminUrl}`)
    .join('\n')
  const text = `Alertă Buzomed Admin\n\n${params.tenants.length} cabinete fără factură pentru ${params.periodLabel}:\n\n${textRows}`

  return { subject, html, text }
}

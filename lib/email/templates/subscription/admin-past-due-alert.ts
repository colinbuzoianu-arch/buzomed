import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface AdminPastDueAlertParams {
  cabinetName: string
  tenantId: string
  daysPastDue: number
  superAdminUrl: string
}

export function renderAdminPastDueAlertEmail(
  params: AdminPastDueAlertParams
): { subject: string; html: string; text: string } {
  const subject = `[Buzomed Admin] ${params.cabinetName} — plată restantă de ${params.daysPastDue} zile`

  const body = `
<p>Alertă automată Buzomed:</p>
<p>Cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> are o factură restantă de
<strong>${params.daysPastDue} zile</strong>. Statusul abonamentului este <code>past_due</code>.</p>
<p>Facturarea se face prin transfer bancar — este necesară intervenție manuală
(contactarea clientului sau confirmarea plății).</p>
${renderButton('Deschide în Super-Admin', params.superAdminUrl)}
<p style="font-size: 13px; color: #6b7280;">Tenant ID: ${escapeHtml(params.tenantId)}</p>
`

  const html = renderEmailLayout({
    preheader: `${params.cabinetName} — plată restantă de ${params.daysPastDue} zile.`,
    body,
    footerText: 'Buzomed · Alertă internă · hello@buzomed.com',
  })

  const text = `Alertă Buzomed Admin\n\nCabinetul ${params.cabinetName} nu a plătit de ${params.daysPastDue} zile (past_due).\n\nDeschide în Super-Admin: ${params.superAdminUrl}\n\nTenant ID: ${params.tenantId}`

  return { subject, html, text }
}

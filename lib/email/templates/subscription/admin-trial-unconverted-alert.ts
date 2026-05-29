import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface AdminTrialUnconvertedAlertParams {
  cabinetName: string
  tenantId: string
  employeeCount: number
  trialExpiredAt: Date
  superAdminUrl: string
}

export function renderAdminTrialUnconvertedAlertEmail(
  params: AdminTrialUnconvertedAlertParams
): { subject: string; html: string; text: string } {
  const subject = `[Buzomed Admin] ${params.cabinetName} — trial expirat, neconvertit (${params.employeeCount} angajați)`

  const expiredDate = params.trialExpiredAt.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const followUpNote =
    params.employeeCount > 10
      ? `<p><strong>Cabinet activ</strong> — cu ${params.employeeCount} angajați înregistrați, merită un follow-up direct.</p>`
      : `<p>Cabinet cu activitate redusă (${params.employeeCount} angajați).</p>`

  const body = `
<p>Alertă automată Buzomed:</p>
<p>Cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> are trial-ul expirat din
<strong>${expiredDate}</strong> și nu a convertit la un plan plătit.</p>
<p>Angajați activi înregistrați: <strong>${params.employeeCount}</strong></p>
${followUpNote}
${renderButton('Deschide în Super-Admin', params.superAdminUrl)}
<p style="font-size: 13px; color: #6b7280;">Tenant ID: ${escapeHtml(params.tenantId)}</p>
`

  const html = renderEmailLayout({
    preheader: `${params.cabinetName} — trial expirat pe ${expiredDate}, neconvertit.`,
    body,
    footerText: 'Buzomed · Alertă internă · hello@buzomed.com',
  })

  const text = `Alertă Buzomed Admin\n\nCabinetul ${params.cabinetName} (trial expirat pe ${expiredDate}) nu a convertit. Angajați activi: ${params.employeeCount}.\n\nDeschide în Super-Admin: ${params.superAdminUrl}\n\nTenant ID: ${params.tenantId}`

  return { subject, html, text }
}

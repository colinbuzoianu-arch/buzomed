import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface AdminEnterpriseAlertParams {
  cabinetName: string
  tenantId: string
  activeEmployeeCount: number
  superAdminUrl: string
}

export function renderAdminEnterpriseAlertEmail(
  params: AdminEnterpriseAlertParams
): { subject: string; html: string; text: string } {
  const subject = `[Buzomed Admin] ${params.cabinetName} a depășit limita Pro — necesită Enterprise`

  const body = `
<p>Alertă automată Buzomed:</p>
<p>Cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> are în prezent
<strong>${params.activeEmployeeCount} angajați activi</strong>, depășind limita
planului Pro (2 000).</p>
<p>Este necesar un contract Enterprise pentru a continua fără restricții. Contactează
cabinetul pentru a negocia condițiile.</p>
${renderButton('Deschide în Super-Admin', params.superAdminUrl)}
<p style="font-size: 13px; color: #6b7280;">Tenant ID: ${escapeHtml(params.tenantId)}</p>
`

  const html = renderEmailLayout({
    preheader: `${params.cabinetName} — ${params.activeEmployeeCount} angajați activi, limita Pro depășită.`,
    body,
    footerText: 'Buzomed · Alertă internă · hello@buzomed.com',
  })

  const text = `Alertă Buzomed Admin\n\nCabinetul ${params.cabinetName} are ${params.activeEmployeeCount} angajați activi, depășind limita Pro (2000).\n\nDeschide în Super-Admin: ${params.superAdminUrl}\n\nTenant ID: ${params.tenantId}`

  return { subject, html, text }
}

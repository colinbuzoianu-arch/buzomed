import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialExpiredParams {
  cabinetName: string
  adminName: string
  billingUrl: string
}

export function renderTrialExpiredEmail(params: TrialExpiredParams): { subject: string; html: string; text: string } {
  const subject = 'Trial-ul tău Buzomed a expirat'

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Perioada de trial pentru cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> a expirat. Accesul la funcționalitățile complete este momentan restricționat.</p>
<p>Datele tale sunt în siguranță — nu se șterge nimic. Activează un plan pentru a relua activitatea normal.</p>
${renderButton('Activează subscripția', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Ai nevoie de ajutor? Scrie-ne la hello@buzomed.com.</p>
`

  const html = renderEmailLayout({
    preheader: `Trial-ul pentru ${params.cabinetName} a expirat. Activează un plan.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nTrial-ul pentru ${params.cabinetName} a expirat. Datele tale sunt salvate.\n\nActivează subscripția: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

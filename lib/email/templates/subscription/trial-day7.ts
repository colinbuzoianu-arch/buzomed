import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialDay7Params {
  cabinetName: string
  adminName: string
  trialEndsAt: Date
  billingUrl: string
}

export function renderTrialDay7Email(params: TrialDay7Params): { subject: string; html: string; text: string } {
  const subject = '7 zile rămase din trial-ul tău Buzomed'
  const endDate = params.trialEndsAt.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Mai ai <strong>7 zile</strong> din trial-ul gratuit pentru cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> (expiră pe ${escapeHtml(endDate)}).</p>
<p>Nu pierde accesul la datele tale. Activează un plan înainte de expirare pentru continuitate completă.</p>
${renderButton('Alege planul tău', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai nevoie de ajutor sau ai întrebări despre prețuri, răspunde la acest email.</p>
`

  const html = renderEmailLayout({
    preheader: `Mai ai 7 zile din trial-ul Buzomed pentru ${params.cabinetName}.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nMai ai 7 zile din trial-ul pentru ${params.cabinetName} (expiră ${endDate}).\n\nAlege un plan: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialDay7Params {
  cabinetName: string
  adminName: string
  trialEndsAt: Date
  billingUrl: string
  /** Active employee count — selects onboarding vs. active-use variant */
  employeeCount: number
}

export function renderTrialDay7Email(params: TrialDay7Params): { subject: string; html: string; text: string } {
  const subject = '7 zile rămase din trial-ul tău Buzomed'
  const endDate = params.trialEndsAt.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
  const isActive = params.employeeCount >= 5

  const body = isActive
    ? `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> are deja <strong>${params.employeeCount} angajați</strong> în Buzomed — mai ai <strong>7 zile</strong> din trial (expiră pe ${escapeHtml(endDate)}).</p>
<p>Alege un plan acum pentru a nu pierde accesul la dosarele existente și istoricul examinărilor.</p>
${renderButton('Continuă cu un plan', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai nevoie de ajutor sau ai întrebări despre prețuri, răspunde la acest email.</p>
`
    : `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Mai ai <strong>7 zile</strong> din trial-ul gratuit pentru cabinetul <strong>${escapeHtml(params.cabinetName)}</strong> (expiră pe ${escapeHtml(endDate)}).</p>
<p>Nu ai adăugat încă angajați — este momentul perfect să explorezi platforma înainte de a alege un plan.</p>
${renderButton('Explorează Buzomed', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai nevoie de ajutor sau ai întrebări despre prețuri, răspunde la acest email.</p>
`

  const html = renderEmailLayout({
    preheader: `Mai ai 7 zile din trial-ul Buzomed pentru ${params.cabinetName}.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = isActive
    ? `Bună, ${params.adminName},\n\n${params.employeeCount} angajați adăugați. Mai ai 7 zile din trial pentru ${params.cabinetName} (expiră ${endDate}).\n\nActivează un plan: ${params.billingUrl}\n\nBuzomed`
    : `Bună, ${params.adminName},\n\nMai ai 7 zile din trial-ul pentru ${params.cabinetName} (expiră ${endDate}).\n\nAlege un plan: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

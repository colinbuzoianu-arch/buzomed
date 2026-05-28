import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface PaymentFailedParams {
  cabinetName: string
  adminName: string
  billingUrl: string
}

export function renderPaymentFailedEmail(params: PaymentFailedParams): { subject: string; html: string; text: string } {
  const subject = 'Plată eșuată — actualizează metoda de plată Buzomed'

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Nu am putut procesa plata pentru subscripția cabinetului <strong>${escapeHtml(params.cabinetName)}</strong>.</p>
<p>Accesul tău este momentan restricționat. Actualizează metoda de plată pentru a relua serviciul fără întrerupere.</p>
${renderButton('Actualizează metoda de plată', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă crezi că este o eroare sau ai nevoie de ajutor, contactează-ne la hello@buzomed.com.</p>
`

  const html = renderEmailLayout({
    preheader: `Plata pentru ${params.cabinetName} a eșuat. Actualizează metoda de plată.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nPlata pentru ${params.cabinetName} a eșuat. Actualizează metoda de plată: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

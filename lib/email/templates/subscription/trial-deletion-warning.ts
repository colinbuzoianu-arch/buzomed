import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialDeletionWarningParams {
  cabinetName: string
  adminName: string
  deletionDate: Date
  billingUrl: string
}

export function renderTrialDeletionWarningEmail(params: TrialDeletionWarningParams): { subject: string; html: string; text: string } {
  const subject = 'Avertizare: datele tale vor fi șterse în 14 zile — Buzomed'
  const deletionDateStr = params.deletionDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Aceasta este o notificare importantă privind cabinetul <strong>${escapeHtml(params.cabinetName)}</strong>.</p>
<p>Trial-ul tău a expirat acum 30 de zile și contul nu a fost activat. Conform politicii noastre de retenție, datele vor fi <strong>șterse definitiv pe ${escapeHtml(deletionDateStr)}</strong>.</p>
<p>Dacă dorești să continui să folosești Buzomed sau să îți exporti datele, acționează înainte de această dată.</p>
${renderButton('Activează contul acum', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă nu mai dorești să folosești Buzomed, poți ignora acest mesaj. Dacă ai întrebări, scrie la hello@buzomed.com.</p>
`

  const html = renderEmailLayout({
    preheader: `Datele cabinetului ${params.cabinetName} vor fi șterse pe ${deletionDateStr}.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nAvertizare: datele cabinetului ${params.cabinetName} vor fi șterse pe ${deletionDateStr}.\n\nActivează contul: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

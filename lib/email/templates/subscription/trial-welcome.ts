import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialWelcomeParams {
  cabinetName: string
  adminName: string
  trialEndsAt: Date
  billingUrl: string
}

export function renderTrialWelcomeEmail(params: TrialWelcomeParams): { subject: string; html: string; text: string } {
  const subject = 'Bine ai venit! Ai 14 zile trial gratuit — Buzomed'
  const endDate = params.trialEndsAt.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Contul cabinetului <strong>${escapeHtml(params.cabinetName)}</strong> a fost creat cu succes. Ai acces complet la platforma Buzomed pentru <strong>14 zile gratuit</strong> — până pe <strong>${escapeHtml(endDate)}</strong>.</p>
<p>În această perioadă poți:</p>
<ul>
  <li>Adăuga angajați și companii</li>
  <li>Efectua examinări medicale complete</li>
  <li>Genera fișe de aptitudine</li>
  <li>Configura locuri de muncă și factorii de risc</li>
</ul>
<p>La finalul trial-ului, alege planul potrivit pentru a continua.</p>
${renderButton('Alege un plan', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai întrebări, răspunde la acest email — suntem here to help.</p>
`

  const html = renderEmailLayout({
    preheader: `Bun venit, ${params.adminName}! Trial-ul tău Buzomed a început.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nContul cabinetului ${params.cabinetName} a fost creat. Ai 14 zile trial gratuit până pe ${endDate}.\n\nAlege un plan: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

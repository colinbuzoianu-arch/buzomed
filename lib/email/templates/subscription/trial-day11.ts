import { renderEmailLayout, renderButton, escapeHtml } from '../layout'

interface TrialDay11Params {
  cabinetName: string
  adminName: string
  trialEndsAt: Date
  billingUrl: string
}

export function renderTrialDay11Email(params: TrialDay11Params): { subject: string; html: string; text: string } {
  const subject = 'Ultimele 3 zile — alege planul tău Buzomed'
  const endDate = params.trialEndsAt.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })

  const body = `
<p>Bună, ${escapeHtml(params.adminName)},</p>
<p>Trial-ul cabinetului <strong>${escapeHtml(params.cabinetName)}</strong> expiră pe <strong>${escapeHtml(endDate)}</strong> — mai ai <strong>3 zile</strong>.</p>
<p>Alege planul potrivit pentru a-ți păstra accesul:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  <tr style="background-color: #f3f4f6;">
    <th style="padding: 8px 12px; text-align: left; font-size: 13px;">Plan</th>
    <th style="padding: 8px 12px; text-align: right; font-size: 13px;">Preț / lună</th>
    <th style="padding: 8px 12px; text-align: right; font-size: 13px;">Angajați</th>
  </tr>
  <tr>
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb;">Starter</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">99 RON</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">până la 100</td>
  </tr>
  <tr style="background-color: #f9fafb;">
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb;">Growth</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">299 RON</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">până la 500</td>
  </tr>
  <tr>
    <td style="padding: 8px 12px; font-size: 13px; border-top: 1px solid #e5e7eb;">Pro</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">699 RON</td>
    <td style="padding: 8px 12px; font-size: 13px; text-align: right; border-top: 1px solid #e5e7eb;">până la 2000</td>
  </tr>
</table>
${renderButton('Activează subscripția acum', params.billingUrl)}
<p style="font-size: 13px; color: #6b7280;">Dacă ai nevoie de un plan Enterprise sau prețuri personalizate, scrie-ne la hello@buzomed.com.</p>
`

  const html = renderEmailLayout({
    preheader: `Ultimele 3 zile din trial-ul Buzomed pentru ${params.cabinetName}.`,
    body,
    footerText: 'Buzomed · Medicină a muncii · hello@buzomed.com',
  })

  const text = `Bună, ${params.adminName},\n\nTrial-ul pentru ${params.cabinetName} expiră pe ${endDate} (3 zile rămase).\n\nPlanuri disponibile:\n- Starter: 99 RON/lună — până la 100 angajați\n- Growth: 299 RON/lună — până la 500 angajați\n- Pro: 699 RON/lună — până la 2000 angajați\n\nActivează: ${params.billingUrl}\n\nBuzomed`

  return { subject, html, text }
}

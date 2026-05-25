import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const summary: string = typeof body.summary === 'string' ? body.summary.slice(0, 2000) : ''
  const currentPage: string = typeof body.currentPage === 'string' ? body.currentPage : '/'
  const cabinetName: string = typeof body.cabinetName === 'string' ? body.cabinetName : '—'

  const result = await sendEmail({
    to: { email: 'hello@buzomed.com', name: 'Colin Buzomed' },
    content: {
      subject: `[Iris Escalation] ${auth.user.firstName} ${auth.user.lastName} — ${cabinetName}`,
      html: `
        <p><strong>Utilizator:</strong> ${auth.user.firstName} ${auth.user.lastName} (${auth.user.email})</p>
        <p><strong>Cabinet:</strong> ${cabinetName}</p>
        <p><strong>Rol:</strong> ${auth.user.roles.join(', ')}</p>
        <p><strong>Pagina:</strong> ${currentPage}</p>
        <hr />
        <p><strong>Rezumat conversație:</strong></p>
        <pre style="font-family: monospace; white-space: pre-wrap; font-size: 13px; background: #f5f5f5; padding: 12px; border-radius: 4px;">${summary}</pre>
        <hr />
        <p style="font-size: 12px; color: #666;">Trimis automat de Iris — asistentul Buzomed</p>
      `,
      text: `Utilizator: ${auth.user.firstName} ${auth.user.lastName} (${auth.user.email})\nCabinet: ${cabinetName}\nRol: ${auth.user.roles.join(', ')}\nPagina: ${currentPage}\n\nRezumat:\n${summary}`,
    },
  })

  if (!result.success) {
    console.error('[iris/escalate] email failed:', result.error)
    return NextResponse.json({ error: 'email_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const reason: string = typeof body.reason === 'string' ? body.reason.trim() : ''

  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, email: true, subscriptionStatus: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (tenant.subscriptionStatus === 'suspended') {
    return NextResponse.json({ error: 'already_suspended' }, { status: 409 })
  }

  await prisma.tenant.update({
    where: { id },
    data: { subscriptionStatus: 'suspended' },
  })

  if (tenant.email) {
    await sendEmail({
      to: { email: tenant.email, name: tenant.name },
      content: {
        subject: `Contul Buzomed — ${tenant.name} — suspendat temporar`,
        html: `
          <p>Bună ziua,</p>
          <p>Contul cabinetului <strong>${tenant.name}</strong> pe platforma Buzomed a fost suspendat temporar.</p>
          ${reason ? `<p>Motiv: ${reason}</p>` : ''}
          <p>Pentru reactivare, contactați echipa Buzomed la <a href="mailto:hello@buzomed.com">hello@buzomed.com</a>.</p>
          <p>Cu stimă,<br/>Echipa Buzomed · Verumsell SRL</p>
        `,
        text: `Contul ${tenant.name} pe Buzomed a fost suspendat temporar.${reason ? ` Motiv: ${reason}` : ''} Pentru reactivare contactați hello@buzomed.com.`,
      },
    })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvitation } from '@/lib/invitations/service'

function getAppUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireRole('super_admin')
  const { id } = await params

  const reg = await prisma.registerRequest.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, tenantId: true },
  })
  if (!reg) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!reg.tenantId) {
    return NextResponse.json(
      { error: 'Înregistrarea nu are un tenant asociat. Creați tenantul manual.' },
      { status: 422 }
    )
  }

  // Check if user is already active (already accepted the invite)
  const user = await prisma.user.findFirst({
    where: { email: reg.email, tenantId: reg.tenantId, deletedAt: null },
    select: { authUserId: true },
  })
  if (user?.authUserId) {
    return NextResponse.json(
      { error: 'Utilizatorul și-a activat deja contul.' },
      { status: 409 }
    )
  }

  const nameParts = reg.name.trim().split(/\s+/)
  const firstName = nameParts.length > 1
    ? nameParts.slice(0, -1).join(' ')
    : nameParts[0]

  const appUrl = getAppUrl(request)

  const inviteResult = await createInvitation({
    actor: {
      userId: actor.id,
      tenantId: null,
      roles: actor.roles,
      fullName: 'Buzomed',
      locale: 'ro',
    },
    email: reg.email,
    role: 'practice_admin',
    tenantId: reg.tenantId,
    recipientName: firstName,
    expiryDays: 14,
    appUrl,
  })

  if (!inviteResult.ok) {
    return NextResponse.json(
      { error: `Invitația nu a putut fi trimisă: ${inviteResult.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, emailSent: inviteResult.emailSent })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvitation } from '@/lib/invitations/service'
import { getLocale } from '@/lib/i18n'
import { generateCnpHashSalt, encryptCnpHashSalt } from '@/lib/crypto/cnp-hash'
import { isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { asObject, requireString } from '@/lib/validation'

/**
 * POST /api/tenants/probe
 *
 * Super-admin only. Creates a blank (no seed data) Solo/comp tenant and
 * sends an invitation email to the practitioner.
 *
 * Input:  { email, firstName, lastName, cabinetName?, locale? }
 * Output: { tenantId, tenantName, practitionerId, invitationId }
 */
export async function POST(request: NextRequest) {
  const actor = await requireRole('super_admin')
  const locale = await getLocale()

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const issues: string[] = []

  const email = requireString('email', body.email, issues, { maxLength: 254 })
  const firstName = requireString('firstName', body.firstName, issues, { maxLength: 100 })
  const lastName = requireString('lastName', body.lastName, issues, { maxLength: 100 })
  const inviteLocale = (body.locale === 'en' ? 'en' : 'ro') as 'ro' | 'en'

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const safeEmail = email as string
  const safeFirstName = firstName as string
  const safeLastName = lastName as string

  const cabinetName =
    (typeof body.cabinetName === 'string' && body.cabinetName.trim())
      ? body.cabinetName.trim()
      : `Cabinet Probă ${safeLastName}`

  const existing = await prisma.user.findUnique({ where: { email: safeEmail } })
  if (existing) {
    return NextResponse.json(
      { error: 'email_already_exists', message: `A user with email ${safeEmail} already exists.` },
      { status: 409 }
    )
  }

  const slug = `probe-${safeLastName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`.slice(0, 40)
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
  if (existingSlug) {
    return NextResponse.json({ error: 'slug_conflict' }, { status: 409 })
  }

  const appUrl = process.env.APP_URL ?? 'https://buzomed.vercel.app'

  let cnpHashSalt: string | null = null
  if (isCnpEncryptionConfigured()) {
    const plainSalt = generateCnpHashSalt()
    cnpHashSalt = encryptCnpHashSalt(plainSalt)
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: cabinetName,
      slug,
      isDemo: false,
      country: 'RO',
      subscriptionTier: 'solo',
      subscriptionStatus: 'comp',
      ...(cnpHashSalt ? { cnpHashSalt } : {}),
    },
    select: { id: true, name: true },
  })

  const practitioner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: safeEmail,
      firstName: safeFirstName,
      lastName: safeLastName,
      roles: ['practice_admin', 'practitioner'],
      isActive: true,
    },
    select: { id: true },
  })

  const inviteResult = await createInvitation({
    actor: {
      userId: actor.id,
      tenantId: null,
      roles: actor.roles,
      fullName: `${actor.firstName} ${actor.lastName}`,
      locale: inviteLocale,
    },
    email: safeEmail,
    role: 'practice_admin',
    tenantId: tenant.id,
    recipientName: safeFirstName,
    expiryDays: 14,
    appUrl,
  })

  if (!inviteResult.ok) {
    return NextResponse.json(
      {
        tenantId: tenant.id,
        practitionerId: practitioner.id,
        warning: 'Tenant created, but invitation email failed.',
        inviteError: inviteResult.error,
      },
      { status: 207 }
    )
  }

  return NextResponse.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    practitionerId: practitioner.id,
    invitationId: inviteResult.invitation.id,
  }, { status: 201 })
}

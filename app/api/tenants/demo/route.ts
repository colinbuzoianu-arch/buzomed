import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvitation } from '@/lib/invitations/service'
import { getLocale } from '@/lib/i18n'
import { generateCnpHashSalt, encryptCnpHashSalt } from '@/lib/crypto/cnp-hash'
import { isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { seedDemoTenant } from '@/lib/demo/seed-data'
import { asObject, requireString, optionalString } from '@/lib/validation'

/**
 * POST /api/tenants/demo
 *
 * Super-admin only. Creates a demo tenant for a specific practitioner:
 *
 *   1. Creates a Tenant with isDemo=true
 *   2. Creates a placeholder User (practice_admin role) for the invitee
 *   3. Seeds the tenant with realistic fake data
 *   4. Sends the practitioner an invitation email via Brevo
 *
 * The practitioner clicks the link, sets a password, and lands in a
 * pre-populated cabinet that looks like it has been running for months.
 *
 * Input:
 *   {
 *     email: string
 *     firstName: string
 *     lastName: string
 *     cabinetName?: string   — defaults to "Cabinet Demo [lastName]"
 *     locale?: 'ro' | 'en'  — defaults to 'ro'
 *   }
 *
 * Output:
 *   { tenantId, invitationId, seeded: { companies, employees, examinations, recalls } }
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

  // All requireString fields are defined after the issues guard above.
  const safeEmail = email as string
  const safeFirstName = firstName as string
  const safeLastName = lastName as string

  const cabinetName =
    (typeof body.cabinetName === 'string' && body.cabinetName.trim())
      ? body.cabinetName.trim()
      : `Cabinet Demo ${safeLastName}`

  // Check for existing user with this email
  const existing = await prisma.user.findUnique({ where: { email: safeEmail } })
  if (existing) {
    return NextResponse.json(
      { error: 'email_already_exists', message: `A user with email ${safeEmail} already exists.` },
      { status: 409 }
    )
  }

  // Generate a unique demo slug
  const baseSlug = `demo-${safeLastName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`
  const slug = baseSlug.slice(0, 40)

  // Check slug uniqueness
  const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
  if (existingSlug) {
    return NextResponse.json({ error: 'slug_conflict' }, { status: 409 })
  }

  const appUrl = process.env.APP_URL ?? 'https://buzomed.vercel.app'

  // Encrypt CNP hash salt if encryption is configured
  let cnpHashSalt: string | null = null
  if (isCnpEncryptionConfigured()) {
    const plainSalt = generateCnpHashSalt()
    cnpHashSalt = encryptCnpHashSalt(plainSalt)
  }

  // Create the demo tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: cabinetName,
      slug,
      isDemo: true,
      country: 'RO',
      subscriptionTier: 'trial',
      subscriptionStatus: 'active',
      ...(cnpHashSalt ? { cnpHashSalt } : {}),
    },
    select: { id: true, name: true },
  })

  // Create placeholder practitioner user (same pattern as regular tenant creation)
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

  // Seed the demo tenant with fake data
  let seeded = { companies: 0, employees: 0, examinations: 0, recalls: 0 }
  try {
    seeded = await seedDemoTenant(prisma, tenant.id, practitioner.id)
  } catch (err) {
    // Seeding failure is non-fatal — the tenant and user were created,
    // the practitioner will just see a less-populated cabinet.
    console.error('[demo-invite] seed failed', err)
  }

  // Send invitation via Brevo (reuse the existing invitation service)
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
    // The tenant + user were created but the email failed.
    // Return a partial-success so super-admin can see what happened.
    return NextResponse.json(
      {
        tenantId: tenant.id,
        practitionerId: practitioner.id,
        seeded,
        warning: 'Tenant and data created, but invitation email failed.',
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
    seeded,
  }, { status: 201 })
}

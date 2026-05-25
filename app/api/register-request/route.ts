import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createInvitation } from '@/lib/invitations/service'
import { sendEmail } from '@/lib/email'
import { generateCnpHashSalt, encryptCnpHashSalt } from '@/lib/crypto/cnp-hash'
import { isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { asObject, requireString, optionalString } from '@/lib/validation'

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 3
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ─── Slug generator ───────────────────────────────────────────────────────────
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 28)
  const suffix = Date.now().toString(36).slice(-5)
  return `${base}-${suffix}`
}

// ─── Split full name into first + last ───────────────────────────────────────
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '.' }
  const lastName = parts[parts.length - 1]
  const firstName = parts.slice(0, -1).join(' ')
  return { firstName, lastName }
}

// ─── App URL helper ───────────────────────────────────────────────────────────
function getAppUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
      { status: 429 }
    )
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}

  // Honeypot: legitimate users never fill this; bots almost always do.
  // Return 200 OK with success: true so bots don't learn they were caught.
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  const issues: string[] = []

  const name = requireString('name', body.name, issues, { maxLength: 100 })
  const email = requireString('email', body.email, issues, { maxLength: 200 })
  const cabinetName = requireString('cabinetName', body.cabinetName, issues, { maxLength: 200 })
  const city = optionalString('city', body.city, issues, { maxLength: 100 })

  if (issues.length > 0) {
    return NextResponse.json({ error: issues[0] }, { status: 400 })
  }

  // All required fields are defined past the issues guard
  const safeName = name as string
  const safeEmail = email!.trim().toLowerCase()
  const safeCabinetName = cabinetName as string

  // Simple email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    return NextResponse.json(
      { error: 'Adresa de email nu este validă.' },
      { status: 400 }
    )
  }

  // Check name minimum length
  if (safeName.length < 3) {
    return NextResponse.json(
      { error: 'Numele trebuie să aibă cel puțin 3 caractere.' },
      { status: 400 }
    )
  }
  if (safeCabinetName.length < 2) {
    return NextResponse.json(
      { error: 'Numele cabinetului trebuie să aibă cel puțin 2 caractere.' },
      { status: 400 }
    )
  }

  // Check duplicate in register_requests
  const existingRequest = await prisma.registerRequest.findFirst({
    where: {
      email: safeEmail,
      status: { in: ['pending', 'approved'] },
    },
    select: { id: true },
  })
  if (existingRequest) {
    return NextResponse.json(
      { error: 'Există deja o cerere pentru această adresă de email.' },
      { status: 409 }
    )
  }

  // Check if email is already an active user
  const existingUser = await prisma.user.findFirst({
    where: { email: safeEmail, deletedAt: null },
    select: { authUserId: true },
  })
  if (existingUser?.authUserId) {
    return NextResponse.json(
      { error: 'Există deja un cont Buzomed pentru această adresă de email. Accesați /login pentru autentificare.' },
      { status: 409 }
    )
  }

  // Find a super_admin to act as the system actor for the invitation
  const superAdmin = await prisma.user.findFirst({
    where: {
      roles: { has: 'super_admin' },
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!superAdmin) {
    console.error('[register-request] No super_admin user found to act as system actor')
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // Generate slug from cabinet name
  const slug = generateSlug(safeCabinetName)
  const slugExists = await prisma.tenant.findUnique({ where: { slug } })
  if (slugExists) {
    // Extremely unlikely collision — just regenerate with extra timestamp
    const slug2 = generateSlug(safeCabinetName + Date.now())
    const slug2Exists = await prisma.tenant.findUnique({ where: { slug: slug2 } })
    if (slug2Exists) {
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
  }
  const finalSlug = slugExists ? generateSlug(safeCabinetName + Date.now()) : slug

  // Generate CNP hash salt
  let cnpHashSalt: string | null = null
  if (isCnpEncryptionConfigured()) {
    try {
      cnpHashSalt = encryptCnpHashSalt(generateCnpHashSalt())
    } catch { /* non-fatal */ }
  }

  const { firstName, lastName } = splitName(safeName)
  const appUrl = getAppUrl(request)

  // Create tenant + placeholder user in transaction
  let tenantId: string
  let adminUserId: string
  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: safeCabinetName,
          slug: finalSlug,
          city: city ?? null,
          country: 'RO',
          subscriptionTier: 'trial',
          subscriptionStatus: 'active',
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          featureFlags: { multi_location_enabled: false, granular_permissions_enabled: false, device_integration_enabled: false },
          settings: {},
          cnpHashSalt,
        },
        select: { id: true },
      })

      await tx.location.create({
        data: {
          tenantId: tenant.id,
          name: safeCabinetName,
          city: city ?? null,
          isPrimary: true,
          isActive: true,
        },
      })

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: safeEmail,
          firstName,
          lastName,
          roles: ['practice_admin', 'practitioner'],
          isActive: true,
          authUserId: null,
        },
        select: { id: true },
      })

      return { tenantId: tenant.id, adminUserId: adminUser.id }
    })
    tenantId = result.tenantId
    adminUserId = result.adminUserId
  } catch (err) {
    console.error('[register-request] Failed to create tenant/user:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // Save the registration request record
  try {
    await prisma.registerRequest.create({
      data: {
        name: safeName,
        email: safeEmail,
        cabinetName: safeCabinetName,
        city: city ?? null,
        status: 'pending',
        tenantId,
      },
    })
  } catch (err) {
    // Non-fatal: tenant + user created; log and continue
    console.error('[register-request] Failed to save register_request row:', err)
  }

  // Send activation invitation via Brevo
  const inviteResult = await createInvitation({
    actor: {
      userId: superAdmin.id,
      tenantId: null,
      roles: ['super_admin'],
      fullName: 'Buzomed',
      locale: 'ro',
    },
    email: safeEmail,
    role: 'practice_admin',
    tenantId,
    recipientName: firstName,
    expiryDays: 14,
    appUrl,
  })

  if (!inviteResult.ok) {
    console.error('[register-request] Invitation creation failed:', inviteResult.error, inviteResult.message)
    // User is created but email wasn't sent — super_admin can resend
  }

  // Send internal notification to hello@buzomed.com (non-fatal if it fails)
  try {
    await sendEmail({
      to: { email: 'hello@buzomed.com', name: 'Buzomed' },
      content: {
        subject: `Înregistrare nouă — ${safeName}, ${safeCabinetName}`,
        html: `
<h2>Înregistrare nouă Buzomed</h2>
<p><strong>Nume:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
<p><strong>Cabinet:</strong> ${safeCabinetName}</p>
<p><strong>Oraș:</strong> ${city ?? 'Nespecificat'}</p>
<p>Contul a fost creat automat și linkul de activare a fost trimis.</p>
        `.trim(),
        text: `Înregistrare nouă Buzomed\nNume: ${safeName}\nEmail: ${safeEmail}\nCabinet: ${safeCabinetName}\nOraș: ${city ?? 'Nespecificat'}\nContul a fost creat automat.`,
      },
      tags: ['registration'],
    })
  } catch (err) {
    console.error('[register-request] Notification email to hello@buzomed.com failed:', err)
  }

  void adminUserId // used in transaction above

  return NextResponse.json({ success: true })
}

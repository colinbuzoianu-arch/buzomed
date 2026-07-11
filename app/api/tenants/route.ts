import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createInvitation } from '@/lib/invitations/service'
import { getLocale } from '@/lib/i18n'
import {
  generateCnpHashSalt,
  encryptCnpHashSalt,
} from '@/lib/crypto/cnp-hash'
import { isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { sendEmail } from '@/lib/email'
import { generateUnsubscribeUrl } from '@/lib/email/suppression'
import { renderTrialWelcomeEmail } from '@/lib/email/templates/subscription/trial-welcome'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

export async function POST(request: Request) {
  // Only super admins can create tenants
  const actor = await requireRole('super_admin')

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Basic validation
  const required = ['name', 'slug', 'adminEmail', 'adminFirstName', 'adminLastName']
  for (const field of required) {
    if (!body[field] || typeof body[field] !== 'string') {
      return NextResponse.json(
        { error: `Missing or invalid field: ${field}` },
        { status: 400 }
      )
    }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json(
      { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
      { status: 400 }
    )
  }

  // Check slug uniqueness
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: body.slug },
  })
  if (existingTenant) {
    return NextResponse.json(
      { error: `Slug "${body.slug}" is already in use` },
      { status: 409 }
    )
  }

  // Check if a user with the admin email already exists.
  // Note: this checks the *global* User table, not just within a tenant.
  // If someone is already a user in another tenant, we currently reject
  // here — multi-tenant membership requires more thought (and probably a
  // separate UserTenantMembership table later).
  const existingUser = await prisma.user.findUnique({
    where: { email: body.adminEmail },
  })
  if (existingUser) {
    return NextResponse.json(
      { error: `A user with email ${body.adminEmail} already exists` },
      { status: 409 }
    )
  }

  // Generate the per-tenant CNP hash salt at create time. The salt is
  // random + encrypted at rest with the project CNP_ENCRYPTION_KEY (same
  // cipher we use for the CNPs themselves). If the key isn't configured,
  // we fall back to leaving the salt NULL — the employee CRUD path will
  // refuse to accept CNPs in that case, surfacing a clear error to the
  // admin. We don't fail tenant creation over it: the cabinet might never
  // want to record CNPs (German practice, etc.).
  let cnpHashSalt: string | null = null
  if (isCnpEncryptionConfigured()) {
    try {
      const plaintextSalt = generateCnpHashSalt()
      cnpHashSalt = encryptCnpHashSalt(plaintextSalt)
    } catch (err) {
      console.error(
        '[tenants] CNP hash salt generation failed; tenant will be created without one',
        err
      )
    }
  } else {
    console.warn(
      '[tenants] CNP_ENCRYPTION_KEY is not configured. Tenant will be created without a hash salt; CNP capture will be blocked until the key is set and the salt is lazily generated.'
    )
  }

  const CURRENT_TERMS_VERSION = '2026-05'
  const CURRENT_PRIVACY_VERSION = '2026-05'

  // Enterprise tenants arrive via the dedicated "?tier=enterprise" link and
  // skip the normal 4-option dropdown entirely — the form sends isEnterprise
  // directly rather than the old subscriptionTier field.
  const isEnterprise = body.isEnterprise === true

  // Create tenant + admin user in a transaction
  let tenantResult
  try {
    tenantResult = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug,
          legalName: body.legalName || null,
          cui: body.cui || null,
          registrationNumber: body.registrationNumber || null,
          addressLine1: body.addressLine1 || null,
          city: body.city || null,
          county: body.county || null,
          postalCode: body.postalCode || null,
          country: 'RO',
          phone: body.phone || null,
          email: body.email || null,
          // Tenant.subscriptionTier is vestigial now that Subscription is the
          // source of truth for billing — kept non-null for schema consistency.
          subscriptionTier: isEnterprise ? 'enterprise' : 'trial',
          subscriptionStatus: 'active',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          featureFlags: {
            multi_location_enabled: false,
            granular_permissions_enabled: false,
            device_integration_enabled: false,
          },
          settings: {},
          cnpHashSalt,
          // GDPR consent — captured at tenant creation time
          termsAcceptedAt: body.termsAccepted ? new Date() : undefined,
          termsVersion: body.termsAccepted ? CURRENT_TERMS_VERSION : undefined,
          privacyAcceptedAt: body.privacyAccepted ? new Date() : undefined,
          privacyVersion: body.privacyAccepted ? CURRENT_PRIVACY_VERSION : undefined,
          dpaAcceptedAt: body.dpaAccepted ? new Date() : undefined,
          dpaAcceptedBy: body.dpaName ?? undefined,
        },
      })

      // Create primary location for the tenant
      await tx.location.create({
        data: {
          tenantId: tenant.id,
          name: tenant.name,
          addressLine1: tenant.addressLine1,
          city: tenant.city,
          county: tenant.county,
          postalCode: tenant.postalCode,
          phone: tenant.phone,
          email: tenant.email,
          isPrimary: true,
          isActive: true,
        },
      })

      // Create the practice admin user as a placeholder (no Supabase auth
      // identity yet). The invitation we send below is what attaches an
      // auth identity to this row when accepted.
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: body.adminEmail,
          firstName: body.adminFirstName,
          lastName: body.adminLastName,
          roles: ['practice_admin', 'practitioner'],
          isActive: true,
          authUserId: null,
        },
      })

      // Create subscription row. Enterprise tenants are on a manual contract —
      // no trial period. Everyone else starts on a 14-day trial, regardless
      // of which of the 4 dropdown options was picked — tier/billingMode only
      // determines what they're billed as once the trial ends or converts.
      const isUsageBased = !isEnterprise && body.billingMode === 'usage'
      const VALID_PLAN_TIERS = ['starter', 'growth', 'pro'] as const

      if (isEnterprise) {
        const enterprisePlan = await tx.plan.findFirst({ where: { tier: 'enterprise' } })
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            tier: 'enterprise',
            billingMode: 'flat',
            planId: enterprisePlan?.id ?? null,
            status: 'active',
            trialEndsAt: null,
          },
        })
      } else if (isUsageBased) {
        const price = typeof body.platformPricePerExam === 'number' ? body.platformPricePerExam : 5
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            // tier stays non-nullable on the Subscription model; this value
            // is a placeholder never used for billing while billingMode is
            // 'usage' (billing reads platformPricePerExam instead).
            tier: 'starter',
            billingMode: 'usage',
            planId: null,
            platformPricePerExam: price,
            status: 'trial_active',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        })
      } else {
        const tier = VALID_PLAN_TIERS.includes(body.planTier) ? body.planTier : 'starter'
        const plan = await tx.plan.findFirst({ where: { tier } })
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            tier,
            billingMode: 'flat',
            planId: plan?.id ?? null,
            status: 'trial_active',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        })
      }

      return { tenant, adminUser }
    })
  } catch (error) {
    console.error('Failed to create tenant:', error)
    return NextResponse.json(
      { error: 'Failed to create tenant. Check server logs.' },
      { status: 500 }
    )
  }

  const { ipAddress, userAgent } = getRequestMeta(request)
  void writeAuditLog({
    tenantId: null,
    userId: actor.id,
    action: 'create',
    entityType: 'tenant',
    entityId: tenantResult.tenant.id,
    entitySummary: tenantResult.tenant.name,
    ipAddress,
    userAgent,
  })

  // Send the invitation email. This happens OUTSIDE the transaction
  // because:
  //   1. Email sending is slow and unrelated to DB consistency.
  //   2. Email failure shouldn't roll back tenant/user creation —
  //      we'd rather have a successfully created tenant with a manual
  //      resend option than fail the whole tenant creation because of
  //      a temporary Brevo issue.
  //
  // The invitation record is created inside createInvitation(); if it
  // fails to persist, that's logged but tenant creation still succeeded.
  //
  // Everything below is a post-transaction side effect wrapped in its own
  // try/catch: the tenant/user/subscription already exist at this point, so
  // no failure here — expected (createInvitation returning ok:false) or
  // unexpected (a throw, e.g. a misconfigured env var deep in a template) —
  // should ever turn this into a 500. A missing EMAIL_UNSUBSCRIBE_SECRET did
  // exactly that once (see .env.example) before this wrapping was added.
  const locale = await getLocale()
  const appUrl = getAppUrl(request)

  let inviteResult: Awaited<ReturnType<typeof createInvitation>> | null = null
  try {
    inviteResult = await createInvitation({
      actor: {
        userId: actor.id,
        tenantId: actor.tenantId,
        roles: actor.roles,
        fullName: `${actor.firstName} ${actor.lastName}`,
        locale,
      },
      email: body.adminEmail,
      role: 'practice_admin',
      tenantId: tenantResult.tenant.id,
      recipientName: `${body.adminFirstName} ${body.adminLastName}`,
      appUrl,
    })
  } catch (err) {
    console.error('[tenants] Unexpected error creating invitation — tenant creation still succeeded', {
      tenantId: tenantResult.tenant.id,
      email: body.adminEmail,
      error: err,
    })
  }

  // Send trial welcome email for self-service tenants.
  // Suppress for enterprise (billing arranged separately), demo, and probe accounts.
  const suppressTrialWelcome = body.isDemo || body.isProbe || isEnterprise
  if (!suppressTrialWelcome) {
    try {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      const welcomeContent = renderTrialWelcomeEmail({
        cabinetName: tenantResult.tenant.name,
        adminName: `${body.adminFirstName} ${body.adminLastName}`,
        trialEndsAt,
        billingUrl: `${appUrl}/settings/billing`,
        unsubscribeUrl: generateUnsubscribeUrl(body.adminEmail),
      })
      sendEmail({
        to: { email: body.adminEmail, name: `${body.adminFirstName} ${body.adminLastName}` },
        content: welcomeContent,
        tags: ['trial-welcome'],
      }).catch((err) => console.error('[tenants] Failed to send trial welcome email', err))
    } catch (err) {
      console.error('[tenants] Unexpected error building/sending trial welcome email — tenant creation still succeeded', {
        tenantId: tenantResult.tenant.id,
        email: body.adminEmail,
        error: err,
      })
    }
  }

  if (!inviteResult || !inviteResult.ok) {
    console.error('[tenants] Failed to send initial admin invite', {
      tenantId: tenantResult.tenant.id,
      email: body.adminEmail,
      error: inviteResult ? inviteResult.error : 'threw_unexpectedly',
      message: inviteResult ? inviteResult.message : 'See error above',
    })
    // We still return success — the tenant exists, the placeholder user
    // exists, and the super-admin can manually resend the invite from
    // the tenant detail page.
  }

  return NextResponse.json({
    tenant: {
      id: tenantResult.tenant.id,
      slug: tenantResult.tenant.slug,
      name: tenantResult.tenant.name,
    },
    adminUser: {
      id: tenantResult.adminUser.id,
      email: tenantResult.adminUser.email,
    },
    inviteSent: inviteResult?.ok === true && inviteResult.emailSent,
    inviteCreated: inviteResult?.ok === true,
  })
}

/**
 * Determine the public-facing app URL for building accept links.
 * Uses NEXT_PUBLIC_APP_URL if set, otherwise reconstructs from request.
 */
function getAppUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

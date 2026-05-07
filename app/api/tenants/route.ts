import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  // Only super admins can create tenants
  await requireRole('super_admin')

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

  // Check if a user with the admin email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: body.adminEmail },
  })
  if (existingUser) {
    return NextResponse.json(
      { error: `A user with email ${body.adminEmail} already exists` },
      { status: 409 }
    )
  }

  // Create tenant + admin user in a transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
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
          subscriptionTier: body.subscriptionTier || 'trial',
          subscriptionStatus: 'active',
          trialEndsAt:
            body.subscriptionTier === 'trial'
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : null,
          featureFlags: {
            multi_location_enabled: false,
            granular_permissions_enabled: false,
            device_integration_enabled: false,
          },
          settings: {},
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

      // Create the practice admin user
      // Note: this user has no Supabase auth identity yet — they'll get one
      // when they accept the invite (future Brevo integration). For now we
      // just create the app-side User row so it exists in the system.
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: body.adminEmail,
          firstName: body.adminFirstName,
          lastName: body.adminLastName,
          roles: ['practice_admin', 'practitioner'],
          isActive: true,
          authUserId: null, // will be filled when they accept invite
        },
      })

      return { tenant, adminUser }
    })

    // TODO: Send invite email via Brevo
    // For now, just log the invitation context to the console
    console.log(
      `\n📧 [INVITE EMAIL STUB]\nTenant created: ${result.tenant.name}\nAdmin user: ${result.adminUser.email}\nThey need to be added to Supabase Auth manually for now.\n`
    )

    return NextResponse.json({
      tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
      adminUser: { id: result.adminUser.id, email: result.adminUser.email },
    })
  } catch (error) {
    console.error('Failed to create tenant:', error)
    return NextResponse.json(
      { error: 'Failed to create tenant. Check server logs.' },
      { status: 500 }
    )
  }
}

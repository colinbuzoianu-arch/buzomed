import { type NextRequest, NextResponse } from 'next/server'
import { getRequestMeta } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCabinetAddress } from '@/lib/tenants/update-cabinet-address'
import { asObject, optionalString } from '@/lib/validation'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Super-admin edit of a cabinet's postal address. Same effect as the
 * practice_admin self-service route, but for any tenant. All the actual
 * work (Tenant + primary Location in one transaction, audit trail) lives
 * in updateCabinetAddress so the two routes can never diverge.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const issues: string[] = []

  const addressLine1 = optionalString('addressLine1', body.addressLine1, issues, { maxLength: 300 })
  const addressLine2 = optionalString('addressLine2', body.addressLine2, issues, { maxLength: 300 })
  const city = optionalString('city', body.city, issues, { maxLength: 100 })
  const county = optionalString('county', body.county, issues, { maxLength: 100 })
  const postalCode = optionalString('postalCode', body.postalCode, issues, { maxLength: 20 })

  if (issues.length > 0) return NextResponse.json({ error: issues[0] }, { status: 400 })

  // Verify the tenant exists before touching anything — mirrors the suspend
  // route's existence check and lets updateCabinetAddress assume a valid id.
  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { ipAddress, userAgent } = getRequestMeta(request)
  const address = await updateCabinetAddress({
    tenantId: id,
    actorUserId: auth.user.id,
    address: { addressLine1, addressLine2, city, county, postalCode },
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ ok: true, address })
}

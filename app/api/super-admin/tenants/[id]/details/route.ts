import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { asObject, optionalString } from '@/lib/validation'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
import { updateCabinetAddress } from '@/lib/tenants/update-cabinet-address'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * Super-admin edit of a cabinet's full details — fiscal identity (name,
 * legal name, CUI, reg. com., phone, email) and postal address.
 *
 * Identity fields are written directly on the Tenant. Address fields go
 * through updateCabinetAddress so the change also reaches the primary
 * Location (the row the fișă de aptitudine reads) and the two never drift
 * apart. Both parts leave an audit trail.
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

  // Identity fields — same set and max lengths as the practice_admin
  // self-service route (/api/settings/practice).
  const name = optionalString('name', body.name, issues, { maxLength: 200 })
  const legalName = optionalString('legalName', body.legalName, issues, { maxLength: 200 })
  const cui = optionalString('cui', body.cui, issues, { maxLength: 20 })
  const regCom = optionalString('regCom', body.regCom, issues, { maxLength: 50 })
  const phone = optionalString('phone', body.phone, issues, { maxLength: 50 })
  const email = optionalString('email', body.email, issues, { maxLength: 200 })

  // Address fields — routed through updateCabinetAddress below.
  const addressLine1 = optionalString('addressLine1', body.addressLine1, issues, { maxLength: 300 })
  const addressLine2 = optionalString('addressLine2', body.addressLine2, issues, { maxLength: 300 })
  const city = optionalString('city', body.city, issues, { maxLength: 100 })
  const county = optionalString('county', body.county, issues, { maxLength: 100 })
  const postalCode = optionalString('postalCode', body.postalCode, issues, { maxLength: 20 })

  if (issues.length > 0) return NextResponse.json({ error: issues[0] }, { status: 400 })

  // Verify the tenant exists before touching anything, and capture the
  // before-state for the identity audit entry.
  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      legalName: true,
      cui: true,
      registrationNumber: true,
      phone: true,
      email: true,
    },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const identityData = {
    ...(name !== undefined && { name }),
    ...(legalName !== undefined && { legalName }),
    ...(cui !== undefined && { cui }),
    ...(regCom !== undefined && { registrationNumber: regCom }),
    ...(phone !== undefined && { phone }),
    ...(email !== undefined && { email }),
  }

  if (Object.keys(identityData).length > 0) {
    await prisma.tenant.update({ where: { id }, data: identityData })

    // Audit only the fields that actually changed.
    const before: Record<string, string | null> = {
      name: tenant.name,
      legalName: tenant.legalName,
      cui: tenant.cui,
      registrationNumber: tenant.registrationNumber,
      phone: tenant.phone,
      email: tenant.email,
    }
    const after: Record<string, string | null> = { ...before, ...identityData }
    const changes: Record<string, { from: string | null; to: string | null }> = {}
    for (const key of Object.keys(before)) {
      if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] }
    }
    if (Object.keys(changes).length > 0) {
      const { ipAddress, userAgent } = getRequestMeta(request)
      void writeAuditLog({
        tenantId: id,
        userId: auth.user.id,
        action: 'update',
        entityType: 'tenant',
        entityId: id,
        entitySummary: tenant.name,
        changes: { cabinetDetails: changes },
        ipAddress,
        userAgent,
      })
    }
  }

  // Address — only when the request carried an address field, so an
  // identity-only save doesn't disturb the primary location.
  const addressProvided = ['addressLine1', 'addressLine2', 'city', 'county', 'postalCode'].some(
    (k) => k in body
  )
  if (addressProvided) {
    const { ipAddress, userAgent } = getRequestMeta(request)
    await updateCabinetAddress({
      tenantId: id,
      actorUserId: auth.user.id,
      address: { addressLine1, addressLine2, city, county, postalCode },
      ipAddress,
      userAgent,
    })
  }

  return NextResponse.json({ ok: true })
}

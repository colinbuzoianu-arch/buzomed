import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { asObject, optionalString } from '@/lib/validation'
import { getRequestMeta } from '@/lib/audit/log'
import { updateCabinetAddress } from '@/lib/tenants/update-cabinet-address'

export async function PATCH(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('practice_admin') || !auth.user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const issues: string[] = []

  const name         = optionalString('name', body.name, issues, { maxLength: 200 })
  const legalName    = optionalString('legalName', body.legalName, issues, { maxLength: 200 })
  const cui          = optionalString('cui', body.cui, issues, { maxLength: 20 })
  const regCom       = optionalString('regCom', body.regCom, issues, { maxLength: 50 })
  const addressLine1 = optionalString('addressLine1', body.addressLine1, issues, { maxLength: 300 })
  const addressLine2 = optionalString('addressLine2', body.addressLine2, issues, { maxLength: 300 })
  const city         = optionalString('city', body.city, issues, { maxLength: 100 })
  const county       = optionalString('county', body.county, issues, { maxLength: 100 })
  const postalCode   = optionalString('postalCode', body.postalCode, issues, { maxLength: 20 })
  const phone        = optionalString('phone', body.phone, issues, { maxLength: 50 })
  const email        = optionalString('email', body.email, issues, { maxLength: 200 })

  const VALID_RETENTION_YEARS = [7, 10, 15, 25, 40]
  let dataRetentionYears: number | undefined
  if ('dataRetentionYears' in body) {
    const val = body.dataRetentionYears
    if (typeof val === 'number' && VALID_RETENTION_YEARS.includes(val)) {
      dataRetentionYears = val
    } else {
      issues.push('dataRetentionYears must be one of 7, 10, 15, 25, 40')
    }
  }

  if (issues.length > 0) return NextResponse.json({ error: issues[0] }, { status: 400 })

  // Non-address fields are updated directly on the Tenant. Address fields go
  // through updateCabinetAddress so the change also reaches the primary
  // Location (the row the fișă de aptitudine reads) — see that helper for why
  // the two must always move together.
  await prisma.tenant.update({
    where: { id: auth.user.tenantId },
    data: {
      ...(name !== undefined && { name }),
      ...(legalName !== undefined && { legalName }),
      ...(cui !== undefined && { cui }),
      ...(regCom !== undefined && { registrationNumber: regCom }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(dataRetentionYears !== undefined && { dataRetentionYears }),
    },
  })

  // Only touch the Location machinery when the request actually carried an
  // address field — a retention-only or identity-only save must not disturb
  // the primary location.
  const addressProvided = ['addressLine1', 'addressLine2', 'city', 'county', 'postalCode'].some(
    (k) => k in body
  )
  if (addressProvided) {
    const { ipAddress, userAgent } = getRequestMeta(request)
    await updateCabinetAddress({
      tenantId: auth.user.tenantId,
      actorUserId: auth.user.id,
      address: { addressLine1, addressLine2, city, county, postalCode },
      ipAddress,
      userAgent,
    })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.user.tenantId },
    select: { id: true, name: true, legalName: true, cui: true, registrationNumber: true, addressLine1: true, addressLine2: true, city: true, county: true, postalCode: true, phone: true, email: true, logoUrl: true, dataRetentionYears: true },
  })

  return NextResponse.json({ tenant })
}

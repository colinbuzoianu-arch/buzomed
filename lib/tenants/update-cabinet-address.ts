import { writeAuditLog } from '@/lib/audit/log'
import { prisma } from '@/lib/prisma'

/**
 * Update a cabinet's postal address in one place, for both the
 * practice_admin self-service route (/api/settings/practice) and the
 * super_admin route (/api/super-admin/tenants/[id]/address).
 *
 * Why this helper exists: the address a cabinet shows on its fișă de
 * aptitudine comes from the examination's Location, NOT from the Tenant
 * row. The Tenant address is used elsewhere (invoices, the super-admin
 * tenant list). Those two were copied once at tenant creation and then
 * never synced, so editing the tenant address alone silently left the
 * fișă printing the old one. Every address edit must therefore touch
 * BOTH rows, in a single transaction, or they drift apart again — which
 * is exactly the kind of divergence that produces an official document
 * with the wrong address on it.
 *
 * Scope decision (intentional): we update the primary Location in place.
 * Past examinations do not keep the address they were issued under — the
 * cabinet has one current address and that is what reprints. Location
 * versioning / multi-location management is explicitly out of scope.
 */

export interface CabinetAddressInput {
  /**
   * Each field is `string | undefined`. `undefined` means "not supplied,
   * leave unchanged" — the same convention optionalString() produces, so
   * an absent or empty form field is a no-op rather than a clear. This
   * matches every other tenant-settings field in the codebase.
   */
  addressLine1?: string
  addressLine2?: string
  city?: string
  county?: string
  postalCode?: string
}

export interface UpdateCabinetAddressParams {
  tenantId: string
  /** The acting user, for the audit trail. */
  actorUserId: string
  address: CabinetAddressInput
  ipAddress?: string
  userAgent?: string
}

/** The address fields, in the order they appear on the form. */
const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'county', 'postalCode'] as const

type AddressField = (typeof ADDRESS_FIELDS)[number]

/**
 * Applies the address change to the Tenant and its primary Location in a
 * single transaction, then writes an audit entry with the before/after
 * values of every field that actually changed.
 *
 * Throws if the tenant does not exist (callers already check this, so a
 * throw here means a logic error, not a user-facing 404 — the caller may
 * still choose to map it). Returns the updated address.
 */
export async function updateCabinetAddress(
  params: UpdateCabinetAddressParams
): Promise<Record<AddressField, string | null>> {
  const { tenantId, actorUserId, address, ipAddress, userAgent } = params

  // Only the fields the caller actually supplied. Built once and reused
  // for both the Tenant and the Location update so the two cannot diverge.
  const data: Partial<Record<AddressField, string>> = {}
  for (const field of ADDRESS_FIELDS) {
    const value = address[field]
    if (value !== undefined) data[field] = value
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        county: true,
        postalCode: true,
      },
    })
    if (!tenant) {
      // Defensive: both routes verify the tenant first. If we get here the
      // tenant was deleted between the check and now, or a caller skipped
      // the check — either way we must not silently succeed.
      throw new Error(`updateCabinetAddress: tenant ${tenantId} not found`)
    }

    const before: Record<AddressField, string | null> = {
      addressLine1: tenant.addressLine1,
      addressLine2: tenant.addressLine2,
      city: tenant.city,
      county: tenant.county,
      postalCode: tenant.postalCode,
    }

    await tx.tenant.update({ where: { id: tenantId }, data })

    // Mirror the change onto the primary Location — the row the fișă reads.
    // Find-or-create mirrors ensurePrimaryLocation (lib/examinations/
    // auto-location.ts): prefer an existing primary, else promote any active
    // location, else create one named after the cabinet.
    const primary = await tx.location.findFirst({
      where: { tenantId, isPrimary: true, isActive: true },
      select: { id: true },
    })
    if (primary) {
      await tx.location.update({ where: { id: primary.id }, data })
    } else {
      const fallback = await tx.location.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true },
      })
      if (fallback) {
        await tx.location.update({
          where: { id: fallback.id },
          data: { ...data, isPrimary: true },
        })
      } else {
        await tx.location.create({
          data: {
            tenantId,
            name: tenant.name,
            isPrimary: true,
            isActive: true,
            ...data,
          },
        })
      }
    }

    const after: Record<AddressField, string | null> = { ...before }
    for (const field of ADDRESS_FIELDS) {
      if (data[field] !== undefined) after[field] = data[field] as string
    }

    return { tenantName: tenant.name, before, after }
  })

  // Audit outside the transaction — writeAuditLog never throws and must not
  // be able to roll back a successful address change. Record only the fields
  // that actually changed.
  const changes: Record<string, { from: string | null; to: string | null }> = {}
  for (const field of ADDRESS_FIELDS) {
    if (result.before[field] !== result.after[field]) {
      changes[field] = { from: result.before[field], to: result.after[field] }
    }
  }

  if (Object.keys(changes).length > 0) {
    void writeAuditLog({
      tenantId,
      userId: actorUserId,
      action: 'update',
      entityType: 'tenant',
      entityId: tenantId,
      entitySummary: result.tenantName,
      changes: { cabinetAddress: changes },
      ipAddress,
      userAgent,
    })
  }

  return result.after
}

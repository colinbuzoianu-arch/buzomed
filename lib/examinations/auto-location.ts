import { prisma } from '@/lib/prisma'

/**
 * Find-or-create the tenant's primary location.
 *
 * Locations represent physical sites where examinations happen. Most
 * cabinets have exactly one (the main office); multi-site cabinets
 * will eventually need a management UI, but until then we lazily
 * auto-create a single "Sediu principal" location the first time
 * something asks for it.
 *
 * Why lazy: tenants get created via /super-admin/tenants/new, which
 * doesn't know whether the cabinet will ever schedule an exam. Adding
 * "create primary location" to tenant creation works but wastes a row
 * for tenants that never use the medical features. This helper makes
 * it just-in-time and idempotent.
 *
 * Returns the location ID.
 */

export async function ensurePrimaryLocation(
  tenantId: string,
  tenantName: string
): Promise<string> {
  // 1. Look for an existing primary.
  const existing = await prisma.location.findFirst({
    where: { tenantId, isPrimary: true, isActive: true },
    select: { id: true },
  })
  if (existing) return existing.id

  // 2. Look for any active location at all — promote it if no primary.
  const fallback = await prisma.location.findFirst({
    where: { tenantId, isActive: true },
    select: { id: true },
  })
  if (fallback) {
    await prisma.location.update({
      where: { id: fallback.id },
      data: { isPrimary: true },
    })
    return fallback.id
  }

  // 3. Create one.
  const created = await prisma.location.create({
    data: {
      tenantId,
      name: tenantName,
      isPrimary: true,
      isActive: true,
    },
    select: { id: true },
  })
  return created.id
}

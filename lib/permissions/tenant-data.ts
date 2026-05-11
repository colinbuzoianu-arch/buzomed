/**
 * Tenant data permission helpers.
 *
 * Scope: tenant-scoped business records (Companies, Employees, and — once
 * built — Workplaces, Examinations, Documents, Vaccinations, etc.). Anything
 * a practice operates on day-to-day, as opposed to global super_admin
 * concerns (tenants themselves, system templates).
 *
 * The role hierarchy here mirrors `lib/permissions/invites.ts`:
 *
 *   super_admin    → does NOT belong in tenant data flows. They operate at
 *                    the platform layer (/super-admin) and are redirected
 *                    away from tenant pages by the page guards. We treat
 *                    super_admin as having no tenant-data rights here so
 *                    accidental calls don't leak across tenants.
 *
 *   practice_admin → full read/write within their tenant
 *   practitioner   → full read/write within their tenant (they're the
 *                    medical operators; assistants prepare for them, but
 *                    practitioners create the records themselves too)
 *   assistant      → read-only within their tenant
 *
 * Keep this in one place. Drift between the API check and the UI check
 * creates either confusing UX (button shown but action rejected) or actual
 * privilege escalation paths.
 */

import type { UserRole } from '@prisma/client'

export interface TenantActor {
  /** All roles assigned to the actor. */
  roles: UserRole[]
  /** The tenant the actor belongs to. Null for super_admin. */
  tenantId: string | null
}

/**
 * Can the actor read tenant data scoped to `tenantId`?
 *
 * True iff actor is in that tenant. super_admin returns false here on
 * purpose — they shouldn't be browsing tenant data through these routes;
 * if cross-tenant inspection is needed it goes through /super-admin
 * surfaces with their own audit trail.
 */
export function canReadTenantData(
  actor: TenantActor,
  tenantId: string
): boolean {
  if (actor.roles.includes('super_admin')) return false
  if (!actor.tenantId) return false
  return actor.tenantId === tenantId
}

/**
 * Can the actor create / update / soft-delete tenant data scoped to
 * `tenantId`? Restricted to practice_admin and practitioner.
 */
export function canWriteTenantData(
  actor: TenantActor,
  tenantId: string
): boolean {
  if (!canReadTenantData(actor, tenantId)) return false
  return (
    actor.roles.includes('practice_admin') ||
    actor.roles.includes('practitioner')
  )
}

/**
 * Convenience: derive a flat capability flag for the UI.
 */
export interface TenantDataCapabilities {
  canRead: boolean
  canWrite: boolean
}

export function tenantDataCapabilities(
  actor: TenantActor,
  tenantId: string
): TenantDataCapabilities {
  return {
    canRead: canReadTenantData(actor, tenantId),
    canWrite: canWriteTenantData(actor, tenantId),
  }
}

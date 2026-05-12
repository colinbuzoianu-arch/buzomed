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
 *   practice_admin → full read/write within their tenant; can view PII
 *   practitioner   → full read/write within their tenant; can view PII
 *   assistant      → read-only within their tenant; CANNOT view PII
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
 * Can the actor see decrypted sensitive PII (CNP today, additional fields
 * later) within `tenantId`? Restricted to practice_admin and practitioner.
 *
 * Why this is separate from canWriteTenantData even though both currently
 * return the same set: when audit logging lands (session 10) we want to
 * record PII-view events even for users who can write everything else.
 * Splitting the check now means the audit log can hook into a single
 * function and we don't have to refactor every CNP-read call site later.
 *
 * Assistants legitimately need to do CRUD (schedule exams, manage
 * workplaces) but they don't need raw CNPs in their daily work — they
 * get the masked display. If a specific assistant needs PII access,
 * promote them to practitioner.
 */
export function canViewSensitivePii(
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
  canViewSensitivePii: boolean
}

export function tenantDataCapabilities(
  actor: TenantActor,
  tenantId: string
): TenantDataCapabilities {
  return {
    canRead: canReadTenantData(actor, tenantId),
    canWrite: canWriteTenantData(actor, tenantId),
    canViewSensitivePii: canViewSensitivePii(actor, tenantId),
  }
}

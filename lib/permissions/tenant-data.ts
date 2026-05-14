/**
 * Tenant data permission helpers.
 *
 * Scope: tenant-scoped business records (Companies, Employees, Workplaces,
 * Examinations, Documents, Recalls, etc.). Anything a practice operates on
 * day-to-day, as opposed to global super_admin concerns.
 *
 * Role hierarchy (after session 12 refactor):
 *
 *   super_admin    → does NOT belong in tenant data flows. Treated as having
 *                    no tenant-data rights so accidental calls don't leak
 *                    across tenants. Operates at /super-admin.
 *
 *   practice_admin → full administrative AND clinical write within their
 *                    tenant; can view PII; can edit other users
 *
 *   practitioner   → full administrative AND clinical write within their
 *                    tenant; can view PII
 *
 *   assistant      → ADMINISTRATIVE write only within their tenant. Can do
 *                    receptionist + data-entry work but cannot perform or
 *                    sign clinical judgements. CANNOT view raw PII (sees
 *                    masked CNP only).
 *
 * "Administrative write" includes:
 *   - Create/edit/archive companies, workplaces
 *   - Create/edit/archive employees (WITHOUT setting/changing CNP)
 *   - Create/edit workplace assignments
 *   - Bulk-import employees
 *   - SCHEDULE examinations (status=scheduled)
 *   - Cancel or no-show an examination
 *   - Upload/delete documents
 *   - Schedule recalls / cancel recalls
 *
 * "Clinical write" includes:
 *   - Start an examination (move scheduled → in_progress)
 *   - Fill clinical findings (anamnesis, vitals, test results, verdict)
 *   - Sign a fișa de aptitudine (immutable after this)
 *   - Set verdicts (apt/inapt/etc)
 *
 * "PII write" (separate axis):
 *   - Setting or changing an employee's CNP
 *   - Other future encrypted fields
 *
 * The split exists because in a real medicina muncii cabinet, an assistant
 * does the receptionist/data-entry work but cannot legally render a medical
 * judgement. Forcing the doctor to also do the data entry wastes their time;
 * giving the assistant clinical-write access is a regulatory problem.
 *
 * Keep this in one place. Drift between the API check and the UI check
 * creates either confusing UX (button shown but action rejected) or actual
 * privilege escalation paths.
 */

import type { UserRole } from '@prisma/client'

export interface TenantActor {
  roles: UserRole[]
  tenantId: string | null
}

/**
 * Can the actor read tenant data scoped to `tenantId`?
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
 * Can the actor perform ADMINISTRATIVE writes within `tenantId`?
 *
 * Administrative writes are the day-to-day receptionist/scheduling/data-entry
 * actions that don't involve clinical judgement. ALL non-super_admin roles
 * in the tenant qualify, including assistants.
 */
export function canWriteAdministrative(
  actor: TenantActor,
  tenantId: string
): boolean {
  if (!canReadTenantData(actor, tenantId)) return false
  return (
    actor.roles.includes('practice_admin') ||
    actor.roles.includes('practitioner') ||
    actor.roles.includes('assistant')
  )
}

/**
 * Can the actor perform CLINICAL writes within `tenantId`?
 *
 * Clinical writes include filling exam findings, setting verdicts, and
 * signing fișa. Restricted to practitioners and practice_admins (who in
 * Romanian medicina muncii are typically also licensed practitioners).
 */
export function canWriteClinical(
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
 * Legacy alias: `canWriteTenantData` mapped to clinical-write in the
 * pre-session-12 model. Kept as a deprecated wrapper so old call sites
 * that don't yet distinguish admin/clinical continue to work conservatively
 * (clinical is the stricter check).
 *
 * @deprecated Use canWriteAdministrative or canWriteClinical instead.
 */
export function canWriteTenantData(
  actor: TenantActor,
  tenantId: string
): boolean {
  return canWriteClinical(actor, tenantId)
}

/**
 * Can the actor see decrypted sensitive PII (CNP today, additional fields
 * later) within `tenantId`?
 *
 * Same set as canWriteClinical — assistants get masked display only.
 * If a specific assistant needs PII access, promote them to practitioner.
 *
 * When audit logging lands (future session), this is the hook point that
 * records PII-view events. Keeping the check separate now means we don't
 * have to refactor every CNP-read call site later.
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
 * Can the actor WRITE PII (set/change a CNP)?
 *
 * Same set as canViewSensitivePii — if you can't see it, you can't change it.
 * Used to strip CNP fields from update payloads by assistants.
 */
export function canWriteSensitivePii(
  actor: TenantActor,
  tenantId: string
): boolean {
  return canViewSensitivePii(actor, tenantId)
}

/**
 * Convenience: derive flat capability flags for UI rendering.
 */
export interface TenantDataCapabilities {
  canRead: boolean
  canWrite: boolean // deprecated alias for canWriteClinical
  canWriteAdministrative: boolean
  canWriteClinical: boolean
  canViewSensitivePii: boolean
  canWriteSensitivePii: boolean
}

export function tenantDataCapabilities(
  actor: TenantActor,
  tenantId: string
): TenantDataCapabilities {
  const clinical = canWriteClinical(actor, tenantId)
  return {
    canRead: canReadTenantData(actor, tenantId),
    canWrite: clinical, // legacy
    canWriteAdministrative: canWriteAdministrative(actor, tenantId),
    canWriteClinical: clinical,
    canViewSensitivePii: canViewSensitivePii(actor, tenantId),
    canWriteSensitivePii: canWriteSensitivePii(actor, tenantId),
  }
}

import type { ExaminationVerdict, Prisma } from '@prisma/client'
import { resolvePeriodRange } from './list-filters'

/**
 * Filtering for the „Avize emise" register — signed examinations that carry a
 * verdict. Distinct from the list filters in two ways:
 *   - the period runs on `signedAt` (when the fișă was issued), not the
 *     examination date;
 *   - revoked fișe are included by default (the register must be complete),
 *     toggled off with `retrase=0`.
 */

export const AVIZE_VERDICTS = ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const

export interface AvizeFilters {
  period?: string
  from?: string
  to?: string
  companyId?: string
  verdict?: string
  /** '0' hides revoked fișe; anything else (incl. absent) keeps them. */
  includeRevoked: boolean
}

export function readAvizeFilters(params: Record<string, string | undefined>): AvizeFilters {
  return {
    period: params.period,
    from: params.from,
    to: params.to,
    companyId: params.companyId,
    verdict: params.verdict,
    includeRevoked: params.retrase !== '0',
  }
}

/** Whether the bulk-PDF preconditions (company + period) are both satisfied. */
export function avizePdfReady(f: AvizeFilters): boolean {
  return Boolean(f.companyId && f.period)
}

export function buildAvizeWhere(
  tenantId: string,
  f: AvizeFilters,
  now: Date = new Date()
): Prisma.ExaminationWhereInput {
  const range = resolvePeriodRange(f.period, f.from, f.to, now)
  const signedAt: Prisma.DateTimeNullableFilter = {
    not: null,
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lt: range.to } : {}),
  }

  return {
    tenantId,
    deletedAt: null,
    signedAt,
    verdict:
      f.verdict && (AVIZE_VERDICTS as readonly string[]).includes(f.verdict)
        ? (f.verdict as ExaminationVerdict)
        : { not: null },
    ...(f.includeRevoked ? {} : { revokedAt: null }),
    ...(f.companyId ? { workplace: { companyId: f.companyId, deletedAt: null } } : {}),
  }
}

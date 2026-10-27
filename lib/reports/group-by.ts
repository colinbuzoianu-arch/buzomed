/**
 * Group-by helpers for the reports charts. URL param values parsed to a small
 * closed set; the pages do the actual bucketing from these.
 */

export type OverviewGroupBy = 'month' | 'quarter'
export const OVERVIEW_GROUP_BYS: OverviewGroupBy[] = ['month', 'quarter']
export function parseOverviewGroupBy(v: string | null | undefined): OverviewGroupBy {
  return v === 'quarter' ? 'quarter' : 'month'
}

export type ExpirationGroupBy = 'month' | 'company'
export const EXPIRATION_GROUP_BYS: ExpirationGroupBy[] = ['month', 'company']
export function parseExpirationGroupBy(v: string | null | undefined): ExpirationGroupBy {
  return v === 'company' ? 'company' : 'month'
}

/** 0-indexed month → quarter index (0..3). */
export function quarterOfMonth(month: number): number {
  return Math.floor(month / 3)
}

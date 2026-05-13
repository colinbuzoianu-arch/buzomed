/**
 * Predefined date ranges for reports.
 *
 * Single source of truth — the operational dashboard, per-company report,
 * and CSV export all use these. If we ever switch to a custom date picker
 * (deferred — see Q1 decision in session 10 README), only this file
 * changes shape.
 *
 * All ranges are computed in UTC. The `from` boundary is inclusive,
 * `to` is exclusive — matches Postgres BETWEEN semantics and avoids
 * the classic "last second of the day" off-by-one.
 *
 * "thisMonth" / "thisQuarter" / "thisYear" are calendar-bounded, NOT
 * trailing windows. Cabinets think in calendar terms ("how was
 * October") far more than in trailing-30-days terms.
 */

export type DateRangeKey =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'last12Months'

export const ALL_DATE_RANGES: DateRangeKey[] = [
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'last12Months',
]

export interface ResolvedRange {
  key: DateRangeKey
  from: Date
  to: Date
}

export function resolveDateRange(key: DateRangeKey, now = new Date()): ResolvedRange {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()

  switch (key) {
    case 'thisMonth': {
      const from = new Date(Date.UTC(year, month, 1))
      const to = new Date(Date.UTC(year, month + 1, 1))
      return { key, from, to }
    }
    case 'lastMonth': {
      const from = new Date(Date.UTC(year, month - 1, 1))
      const to = new Date(Date.UTC(year, month, 1))
      return { key, from, to }
    }
    case 'thisQuarter': {
      const qStartMonth = Math.floor(month / 3) * 3
      const from = new Date(Date.UTC(year, qStartMonth, 1))
      const to = new Date(Date.UTC(year, qStartMonth + 3, 1))
      return { key, from, to }
    }
    case 'lastQuarter': {
      const qStartMonth = Math.floor(month / 3) * 3 - 3
      const from = new Date(Date.UTC(year, qStartMonth, 1))
      const to = new Date(Date.UTC(year, qStartMonth + 3, 1))
      return { key, from, to }
    }
    case 'thisYear': {
      const from = new Date(Date.UTC(year, 0, 1))
      const to = new Date(Date.UTC(year + 1, 0, 1))
      return { key, from, to }
    }
    case 'last12Months': {
      // 12 calendar months back from the start of the current month,
      // inclusive of the current month. So in mid-May 2026, we get
      // June 2025 → end of May 2026.
      const from = new Date(Date.UTC(year, month - 11, 1))
      const to = new Date(Date.UTC(year, month + 1, 1))
      return { key, from, to }
    }
  }
}

export function parseDateRange(value: string | null | undefined): DateRangeKey {
  if (value && (ALL_DATE_RANGES as string[]).includes(value)) {
    return value as DateRangeKey
  }
  return 'thisMonth'
}

/**
 * Produces an array of month buckets for a monthly trend chart.
 *
 * Given a date range, returns one bucket per calendar month it touches,
 * each with `{ year, month, from, to }`. The caller then groups events
 * into these buckets.
 *
 * For ranges shorter than a month (which our predefined set doesn't
 * include but a future custom range might), this returns a single
 * bucket spanning the range.
 */
export function monthBucketsForRange(range: ResolvedRange): Array<{
  year: number
  month: number // 0-indexed (Jan = 0), matches Date.UTC convention
  from: Date
  to: Date
}> {
  const buckets: Array<{ year: number; month: number; from: Date; to: Date }> =
    []
  const cursor = new Date(range.from)
  while (cursor < range.to) {
    const y = cursor.getUTCFullYear()
    const m = cursor.getUTCMonth()
    const bucketFrom = new Date(Date.UTC(y, m, 1))
    const bucketTo = new Date(Date.UTC(y, m + 1, 1))
    // Clamp the last bucket to the range's `to`, in case the range
    // doesn't end on a calendar month boundary.
    const clampedTo = bucketTo > range.to ? range.to : bucketTo
    buckets.push({ year: y, month: m, from: bucketFrom, to: clampedTo })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return buckets
}

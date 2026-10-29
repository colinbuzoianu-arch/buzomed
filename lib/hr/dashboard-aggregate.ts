/**
 * HR dashboard aggregation — pure, isomorphic, no server imports.
 *
 * This module is deliberately framework-free so the SAME code runs in two
 * places with identical results:
 *   - on the server (page.tsx / stats route) for the first paint and the API, and
 *   - in the browser, to recompute instantly when the HR user changes the
 *     company / workplace filter, without a round trip.
 *
 * The expensive, authoritative per-employee resolution (reading examinations
 * and recalls out of Postgres, excluding revoked/unsigned fișe, picking the
 * governing fișă) happens once, server-side, in lib/hr/dashboard-data.ts and
 * produces the compact `HrEmployeeRow[]` below. Everything here is O(n)
 * counting over those rows, so re-running it on every filter change is free.
 *
 * HARD RULE (see docs/prompt-hr-dashboard.md): nothing in HrEmployeeRow is
 * medical. Only what appears on the fișa de aptitudine — the verdict, the
 * dates, workplace and job title. No diagnoses, anamnesis, clinical findings,
 * vitals, test results, verdict-condition text or recommendations.
 */

export type HrStatus = 'valid' | 'expiringSoon' | 'expired' | 'noExamination'
export type HrVerdict = 'apt' | 'apt_conditionat' | 'inapt_temporar' | 'inapt'

/** A slice/legend key for the "avize medicale" donut. */
export type AvizeKey = HrVerdict | 'necunoscut'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compact, medical-data-free view of one active employee, as produced by the
 * server loader. `status` is intentionally NOT stored here — it is derived
 * from `dueDate` + the current time so the dashboard stays correct no matter
 * when it is viewed, and so server and client agree on a single "now".
 */
export interface HrEmployeeRow {
  id: string
  lastName: string
  firstName: string
  jobTitle: string | null
  companyId: string | null
  workplaceId: string | null
  workplaceName: string | null
  /**
   * Verdict of the governing fișă. Null when there is no signed Buzomed
   * examination for this employee (e.g. imported, examined before Buzomed).
   */
  verdict: HrVerdict | null
  /**
   * false for employees whose only record is an imported recall (examined
   * before Buzomed) or who have no record at all — their verdict is shown as
   * a separate grey "necunoscut" slice, never counted as apt.
   */
  verdictKnown: boolean
  /** Where `dueDate` came from: a signed exam, an open recall, or nothing. */
  source: 'examination' | 'recall' | 'none'
  /** Governing due date (ISO) — exam.nextExaminationDueDate or recall.dueDate. */
  dueDate: string | null
  /** inapt_temporar end date (ISO), for alerts. Null otherwise. */
  inaptTemporarUntil: string | null
  /** Employee has an open recall with status `scheduled` (control programat). */
  hasScheduledRecall: boolean
}

export interface HrFilter {
  companyId: string | 'all'
  workplaceId: string | 'all'
}

/** A table filter driven by clicking a chart slice / bar / alert. */
export type HrTableFilter =
  | { type: 'none' }
  | { type: 'status'; value: HrStatus }
  | { type: 'avize'; value: AvizeKey }
  | { type: 'programare'; value: 'programat' | 'neprogramat' }
  | { type: 'month'; value: string } // monthKey, or 'expired'
  | { type: 'workplace'; value: string } // workplaceId, '' = none assigned
  | { type: 'expiring7NoSchedule' }
  | { type: 'inaptTemporar' }
  | { type: 'inaptTemporarEndingSoon' }
  | { type: 'noRecord' }

export interface DonutSlice<K extends string = string> {
  key: K
  value: number
}

export interface MonthBucket {
  key: string // 'expired' or 'YYYY-MM'
  year: number
  month: number // 0-11; -1 for the 'expired' bucket
  value: number
  tone: 'overdue' | 'neutral'
}

export interface WorkplaceBucket {
  workplaceId: string // '' when the employee has no current workplace
  workplaceName: string
  valid: number
  expiringSoon: number
  expired: number
  noExamination: number
  total: number
}

export interface HrAlerts {
  expired: number
  inaptTemporar: number
  inaptTemporarEndingSoon: number
  noRecord: number
  expiring7NoSchedule: number
}

export interface HrDashboardResult {
  /** Header-filtered rows, each decorated with its derived status, for the table. */
  rows: Array<HrEmployeeRow & { status: HrStatus }>
  summary: {
    total: number
    valid: number
    expiringSoon: number
    expired: number
    noExamination: number
    /** % of employees with a valid (not expiring/expired/missing) fișă. */
    conformPct: number
  }
  compliance: DonutSlice<HrStatus>[]
  avize: DonutSlice<AvizeKey>[]
  programari: {
    slices: DonutSlice<'programat' | 'neprogramat'>[]
    total: number // employees due in the next 60 days
  }
  byMonth: MonthBucket[]
  byWorkplace: WorkplaceBucket[]
  alerts: HrAlerts
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Derives the compliance status of one row relative to `nowMs`. */
export function statusForRow(row: HrEmployeeRow, nowMs: number): HrStatus {
  if (!row.dueDate) return 'noExamination'
  const today = startOfUtcDay(nowMs)
  const due = startOfUtcDay(new Date(row.dueDate).getTime())
  if (due < today) return 'expired'
  if (due <= today + 30 * DAY_MS) return 'expiringSoon'
  return 'valid'
}

function passesHeaderFilter(row: HrEmployeeRow, filter: HrFilter): boolean {
  if (filter.companyId !== 'all' && row.companyId !== filter.companyId) return false
  if (filter.workplaceId !== 'all' && (row.workplaceId ?? '') !== filter.workplaceId) return false
  return true
}

/** Does a row match the active table filter (chart-driven drill-down)? */
export function matchesTableFilter(
  row: HrEmployeeRow & { status: HrStatus },
  filter: HrTableFilter,
  nowMs: number
): boolean {
  const today = startOfUtcDay(nowMs)
  const dueMs = row.dueDate ? startOfUtcDay(new Date(row.dueDate).getTime()) : null

  switch (filter.type) {
    case 'none':
      return true
    case 'status':
      return row.status === filter.value
    case 'avize': {
      if (row.status !== 'valid' && row.status !== 'expiringSoon') return false
      if (filter.value === 'necunoscut') return !row.verdictKnown
      return row.verdictKnown && row.verdict === filter.value
    }
    case 'programare': {
      if (dueMs === null) return false
      const dueSoon = dueMs >= today && dueMs <= today + 60 * DAY_MS
      if (!dueSoon) return false
      return filter.value === 'programat' ? row.hasScheduledRecall : !row.hasScheduledRecall
    }
    case 'month': {
      if (filter.value === 'expired') return row.status === 'expired'
      if (dueMs === null || row.status === 'expired') return false
      const d = new Date(dueMs)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      return key === filter.value
    }
    case 'workplace':
      return (row.workplaceId ?? '') === filter.value
    case 'expiring7NoSchedule':
      return (
        dueMs !== null &&
        dueMs >= today &&
        dueMs <= today + 7 * DAY_MS &&
        !row.hasScheduledRecall
      )
    case 'inaptTemporar':
      return row.verdictKnown && row.verdict === 'inapt_temporar'
    case 'inaptTemporarEndingSoon': {
      if (!row.inaptTemporarUntil) return false
      const end = startOfUtcDay(new Date(row.inaptTemporarUntil).getTime())
      return end >= today && end <= today + 14 * DAY_MS
    }
    case 'noRecord':
      return row.source === 'none'
    default:
      return true
  }
}

/**
 * The one aggregation pass. Given all rows for the HR user's scope, a header
 * filter (company/workplace) and a reference time, returns everything the
 * dashboard renders. Pure and cheap — safe to call on every filter change.
 */
export function aggregateHrDashboard(
  allRows: HrEmployeeRow[],
  filter: HrFilter,
  nowMs: number
): HrDashboardResult {
  const today = startOfUtcDay(nowMs)

  const rows = allRows
    .filter((r) => passesHeaderFilter(r, filter))
    .map((r) => ({ ...r, status: statusForRow(r, nowMs) }))

  const summary = {
    total: rows.length,
    valid: 0,
    expiringSoon: 0,
    expired: 0,
    noExamination: 0,
    conformPct: 0,
  }

  const avizeCounts: Record<AvizeKey, number> = {
    apt: 0,
    apt_conditionat: 0,
    inapt_temporar: 0,
    inapt: 0,
    necunoscut: 0,
  }

  let programat = 0
  let neprogramat = 0
  let dueSoon60 = 0

  // 6 month buckets from the current month, keyed YYYY-MM, plus 'expired'.
  const monthBuckets: MonthBucket[] = []
  const monthMap = new Map<string, MonthBucket>()
  const base = new Date(today)
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const bucket: MonthBucket = {
      key,
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      value: 0,
      tone: 'neutral',
    }
    monthBuckets.push(bucket)
    monthMap.set(key, bucket)
  }
  let expiredBucket = 0

  const workplaceMap = new Map<string, WorkplaceBucket>()

  const alerts: HrAlerts = {
    expired: 0,
    inaptTemporar: 0,
    inaptTemporarEndingSoon: 0,
    noRecord: 0,
    expiring7NoSchedule: 0,
  }

  for (const row of rows) {
    // Compliance summary
    summary[row.status]++

    // Avize medicale — only among fișe still in force (valid/expiring).
    if (row.status === 'valid' || row.status === 'expiringSoon') {
      if (row.verdictKnown && row.verdict) avizeCounts[row.verdict]++
      else avizeCounts.necunoscut++
    }

    const dueMs = row.dueDate ? startOfUtcDay(new Date(row.dueDate).getTime()) : null

    // Programări — among employees due within the next 60 days.
    if (dueMs !== null && dueMs >= today && dueMs <= today + 60 * DAY_MS) {
      dueSoon60++
      if (row.hasScheduledRecall) programat++
      else neprogramat++
    }

    // Scadențe pe 6 luni + deja expirați
    if (row.status === 'expired') {
      expiredBucket++
    } else if (dueMs !== null) {
      const d = new Date(dueMs)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const bucket = monthMap.get(key)
      if (bucket) bucket.value++
    }

    // Conformitate pe loc de muncă
    const wid = row.workplaceId ?? ''
    let wb = workplaceMap.get(wid)
    if (!wb) {
      wb = {
        workplaceId: wid,
        workplaceName: row.workplaceName ?? '',
        valid: 0,
        expiringSoon: 0,
        expired: 0,
        noExamination: 0,
        total: 0,
      }
      workplaceMap.set(wid, wb)
    }
    wb[row.status]++
    wb.total++

    // Alerts
    if (row.status === 'expired') alerts.expired++
    if (row.source === 'none') alerts.noRecord++
    if (row.verdictKnown && row.verdict === 'inapt_temporar') alerts.inaptTemporar++
    if (row.inaptTemporarUntil) {
      const end = startOfUtcDay(new Date(row.inaptTemporarUntil).getTime())
      if (end >= today && end <= today + 14 * DAY_MS) alerts.inaptTemporarEndingSoon++
    }
    if (
      dueMs !== null &&
      dueMs >= today &&
      dueMs <= today + 7 * DAY_MS &&
      !row.hasScheduledRecall
    ) {
      alerts.expiring7NoSchedule++
    }
  }

  summary.conformPct = summary.total > 0 ? Math.round((summary.valid / summary.total) * 100) : 0

  const byMonth: MonthBucket[] = [
    { key: 'expired', year: 0, month: -1, value: expiredBucket, tone: 'overdue' },
    ...monthBuckets,
  ]

  // Worst-first: most expired + missing, then most expiring.
  const byWorkplace = [...workplaceMap.values()].sort((a, b) => {
    const aBad = a.expired + a.noExamination
    const bBad = b.expired + b.noExamination
    if (bBad !== aBad) return bBad - aBad
    if (b.expiringSoon !== a.expiringSoon) return b.expiringSoon - a.expiringSoon
    return b.total - a.total
  })

  return {
    rows,
    summary,
    compliance: [
      { key: 'valid', value: summary.valid },
      { key: 'expiringSoon', value: summary.expiringSoon },
      { key: 'expired', value: summary.expired },
      { key: 'noExamination', value: summary.noExamination },
    ],
    avize: [
      { key: 'apt', value: avizeCounts.apt },
      { key: 'apt_conditionat', value: avizeCounts.apt_conditionat },
      { key: 'inapt_temporar', value: avizeCounts.inapt_temporar },
      { key: 'inapt', value: avizeCounts.inapt },
      { key: 'necunoscut', value: avizeCounts.necunoscut },
    ],
    programari: {
      slices: [
        { key: 'programat', value: programat },
        { key: 'neprogramat', value: neprogramat },
      ],
      total: dueSoon60,
    },
    byMonth,
    byWorkplace,
    alerts,
  }
}

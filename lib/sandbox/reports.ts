/**
 * Report aggregates computed from the sandbox dataset, shaped for the reused
 * chart components (donut, stacked bar, horizontal bar, expiration bar,
 * progress list, stacked progress).
 */

import { computeEmployeeStatus } from '@/components/employees/employee-status'
import type { DonutDatum } from '@/components/reports/charts/donut-chart'
import type { ExpirationDatum } from '@/components/reports/charts/expiration-bar-chart'
import type { HBarDatum } from '@/components/reports/charts/horizontal-bar-chart'
import type { ProgressDatum } from '@/components/reports/charts/progress-bar-list'
import type { VerdictRow } from '@/components/reports/charts/stacked-bar-chart'
import { Rng } from './rng'
import type { SandboxData } from './types'

const MONTHS_RO = [
  'Ian',
  'Feb',
  'Mar',
  'Apr',
  'Mai',
  'Iun',
  'Iul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const VERDICT_LABELS = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
} as const

export function verdictDonut(data: SandboxData): DonutDatum[] {
  const counts = { apt: 0, apt_conditionat: 0, inapt_temporar: 0, inapt: 0 }
  for (const e of data.examinations) {
    if (e.signedAt && e.verdict) counts[e.verdict]++
  }
  return (Object.keys(counts) as Array<keyof typeof counts>).map((k) => ({
    key: k,
    label: VERDICT_LABELS[k],
    value: counts[k],
  }))
}

export function monthlyVerdicts(data: SandboxData): VerdictRow[] {
  const now = data.now
  const rows: VerdictRow[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = `${MONTHS_RO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    const row: VerdictRow = { label, apt: 0, apt_conditionat: 0, inapt_temporar: 0, inapt: 0 }
    for (const e of data.examinations) {
      if (e.status !== 'completed' || !e.completedAt || !e.verdict) continue
      if (
        e.completedAt.getFullYear() === d.getFullYear() &&
        e.completedAt.getMonth() === d.getMonth()
      ) {
        row[e.verdict]++
      }
    }
    rows.push(row)
  }
  return rows
}

export interface CompanyCoverage {
  companyId: string
  companyName: string
  total: number
  valid: number
  expired: number
  never: number
  coverage: number | null
}

export function companyCompliance(data: SandboxData): CompanyCoverage[] {
  const recallByEmp = new Map<string, { dueDate: string; status: string }>()
  for (const r of data.recalls) {
    if (r.status !== 'pending' && r.status !== 'scheduled' && r.status !== 'overdue') continue
    const ymd = `${r.dueDate.getFullYear()}-${String(r.dueDate.getMonth() + 1).padStart(2, '0')}-${String(r.dueDate.getDate()).padStart(2, '0')}`
    const existing = recallByEmp.get(r.employeeId)
    if (!existing || ymd < existing.dueDate)
      recallByEmp.set(r.employeeId, { dueDate: ymd, status: r.status })
  }
  const examEmpIds = new Set(
    data.examinations.filter((e) => e.status === 'completed').map((e) => e.employeeId)
  )

  return data.companies.map((c) => {
    const emps = data.employees.filter((e) => e.companyId === c.id && e.archivedAt === null)
    let valid = 0
    let expired = 0
    let never = 0
    for (const e of emps) {
      const hasExam = examEmpIds.has(e.id)
      const s = computeEmployeeStatus({ recall: recallByEmp.get(e.id) ?? null, hasExam })
      if (!hasExam) never++
      else if (s.kind === 'overdue') expired++
      else valid++
    }
    const coverage = emps.length === 0 ? null : Math.round((valid / emps.length) * 1000) / 10
    return {
      companyId: c.id,
      companyName: c.name,
      total: emps.length,
      valid,
      expired,
      never,
      coverage,
    }
  })
}

export function expirationBuckets(data: SandboxData): ExpirationDatum[] {
  const now = new Date(data.now)
  now.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const open = data.recalls.filter(
    (r) => r.status === 'pending' || r.status === 'scheduled' || r.status === 'overdue'
  )
  let overdue = 0
  let d30 = 0
  let d60 = 0
  let d90 = 0
  let later = 0
  for (const r of open) {
    const diff = Math.round((new Date(r.dueDate).setHours(0, 0, 0, 0) - now.getTime()) / day)
    if (diff < 0) overdue++
    else if (diff <= 30) d30++
    else if (diff <= 60) d60++
    else if (diff <= 90) d90++
    else later++
  }
  return [
    { label: 'Depășite', value: overdue, tone: 'overdue' },
    { label: '0–30 zile', value: d30, tone: 'soon' },
    { label: '31–60 zile', value: d60, tone: 'neutral' },
    { label: '61–90 zile', value: d90, tone: 'neutral' },
    { label: 'peste 90 zile', value: later, tone: 'neutral' },
  ]
}

export function hazardExposure(data: SandboxData): HBarDatum[] {
  const wpById = new Map(data.workplaces.map((w) => [w.id, w]))
  const counts = new Map<string, number>()
  for (const e of data.employees) {
    if (e.archivedAt !== null || !e.workplaceId) continue
    const wp = wpById.get(e.workplaceId)
    if (!wp) continue
    for (const h of wp.hazards) counts.set(h.label, (counts.get(h.label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

export function examsByType(data: SandboxData): HBarDatum[] {
  const typeById = new Map(data.examinationTypes.map((t) => [t.id, t]))
  const counts = new Map<string, number>()
  for (const e of data.examinations) {
    if (e.status !== 'completed') continue
    const name = typeById.get(e.examinationTypeId)?.nameRo ?? '—'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Synthetic but deterministic vaccination coverage (the fixtures carry no
 * vaccination records). Percentages of active employees per common vaccine.
 */
export function vaccinationCoverage(data: SandboxData): ProgressDatum[] {
  const rng = new Rng(0x7a21c4)
  const active = data.employees.filter((e) => e.archivedAt === null).length
  const vaccines = [
    { label: 'Antitetanic (dT)', frac: 0.82 },
    { label: 'Hepatită B', frac: 0.64 },
    { label: 'Antigripal (sezonier)', frac: 0.41 },
    { label: 'Hepatită A', frac: 0.3 },
  ]
  return vaccines.map((v) => ({
    label: v.label,
    value: Math.round(active * (v.frac + (rng.float() - 0.5) * 0.06)),
  }))
}

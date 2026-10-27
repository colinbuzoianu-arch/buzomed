import { prisma } from '@/lib/prisma'
import { monthBucketsForRange } from './date-ranges'
import type { DateRangeKey } from './date-ranges'

export interface ComplianceEmployee {
  id: string
  lastName: string
  firstName: string
  jobTitle: string | null
  workplaceId: string | null
  workplaceName: string | null
  lastExamDate: string | null
  lastVerdict: string | null
  nextDueDate: string | null
  status: 'valid' | 'expired' | 'never_examined'
}

export interface ComplianceData {
  company: { id: string; name: string; cui: string | null }
  tenant: { name: string }
  year: number
  generatedAt: string
  snapshot: {
    totalActiveEmployees: number
    employeesWithValidFisa: number
    employeesWithExpiredFisa: number
    employeesNeverExamined: number
    coverageRate: number | null
    expiringIn30Days: number
    expiringIn60Days: number
    expiringIn90Days: number
  }
  forecast: {
    in30Days: { projectedValid: number; projectedRate: number | null; expiringCount: number; recallsDue: number }
    in60Days: { projectedValid: number; projectedRate: number | null; expiringCount: number; recallsDue: number }
    in90Days: { projectedValid: number; projectedRate: number | null; expiringCount: number; recallsDue: number }
  }
  annual: {
    totalExaminationsYear: number
    signedExaminationsYear: number
    verdictBreakdown: { apt: number; apt_conditionat: number; inapt_temporar: number; inapt: number }
    avgDaysFromScheduledToSigned: number | null
  }
  adherence: {
    totalRecallsDue: number
    recallsCompleted: number
    recallsOverdue: number
    adherenceRate: number | null
  }
  monthlyTrend: Array<{
    month: number // 1-12
    year: number
    examinationsCompleted: number
    recallsDue: number
    recallsCompleted: number
  }>
  workplaceBreakdown: Array<{
    workplaceId: string
    workplaceName: string
    totalEmployees: number
    validFisa: number
    expired: number
    neverExamined: number
    coverageRate: number | null
  }>
  employeeList: ComplianceEmployee[]
}

// ─── Shared "valid fișă" definition ──────────────────────────────────────────
// ONE source of truth for how a worker's fitness certificate is classified,
// reused by the per-company report (computeComplianceData) and the tenant-wide
// overview (computeTenantCompliance). Do not inline this rule anywhere else.

export type FisaStatus = 'valid' | 'expired' | 'never_examined'

/** A worker's latest signed examination (or null if never examined). */
interface LatestExam {
  nextExaminationDueDate: Date | null
}

export function classifyFisa(latestExam: LatestExam | null, today: Date): FisaStatus {
  if (!latestExam) return 'never_examined'
  const due = latestExam.nextExaminationDueDate
  return due && due > today ? 'valid' : 'expired'
}

export interface FisaSummary {
  total: number
  valid: number
  expired: number
  neverExamined: number
  expiring30: number
  expiring60: number
  expiring90: number
}

/**
 * Aggregate a set of workers (each with their latest signed exam) into the
 * snapshot counts. `expiringN` counts only VALID fișe whose due date falls
 * within N days — identical to the per-company snapshot loop.
 */
export function summarizeFisa(
  employees: Array<{ latestExam: LatestExam | null }>,
  today: Date
): FisaSummary {
  const todayPlus30 = new Date(today.getTime() + 30 * 86_400_000)
  const todayPlus60 = new Date(today.getTime() + 60 * 86_400_000)
  const todayPlus90 = new Date(today.getTime() + 90 * 86_400_000)
  const s: FisaSummary = {
    total: employees.length,
    valid: 0,
    expired: 0,
    neverExamined: 0,
    expiring30: 0,
    expiring60: 0,
    expiring90: 0,
  }
  for (const emp of employees) {
    const status = classifyFisa(emp.latestExam, today)
    if (status === 'never_examined') {
      s.neverExamined++
    } else if (status === 'expired') {
      s.expired++
    } else {
      s.valid++
      // due is guaranteed > today for a 'valid' status.
      const due = emp.latestExam?.nextExaminationDueDate as Date
      if (due <= todayPlus30) s.expiring30++
      if (due <= todayPlus60) s.expiring60++
      if (due <= todayPlus90) s.expiring90++
    }
  }
  return s
}

function coverageOf(valid: number, total: number): number | null {
  return total > 0 ? Math.round((valid / total) * 1000) / 10 : null
}

export async function computeComplianceData(params: {
  companyId: string
  tenantId: string
  year: number
}): Promise<ComplianceData | null> {
  const { companyId, tenantId, year } = params

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayPlus30 = new Date(today.getTime() + 30 * 86_400_000)
  const todayPlus60 = new Date(today.getTime() + 60 * 86_400_000)
  const todayPlus90 = new Date(today.getTime() + 90 * 86_400_000)

  const [company, tenant, employees, yearExams, yearRecalls, overdueRecalls, workplaces, upcomingRecalls] =
    await Promise.all([
      prisma.company.findFirst({
        where: { id: companyId, tenantId, deletedAt: null },
        select: { id: true, name: true, cui: true },
      }),
      prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { name: true, legalName: true },
      }),
      prisma.employee.findMany({
        where: {
          companyId,
          tenantId,
          isActive: true,
          deletedAt: null,
          archivedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          examinations: {
            where: { deletedAt: null, signedAt: { not: null } },
            orderBy: { signedAt: 'desc' },
            take: 1,
            select: {
              signedAt: true,
              verdict: true,
              nextExaminationDueDate: true,
            },
          },
          workplaceAssignments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              workplace: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.examination.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: yearStart, lt: yearEnd },
          workplace: { companyId, deletedAt: null },
        },
        select: {
          scheduledAt: true,
          signedAt: true,
          verdict: true,
          createdAt: true,
        },
      }),
      prisma.recall.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dueDate: { gte: yearStart, lt: yearEnd },
          workplace: { companyId, deletedAt: null },
        },
        select: { id: true, status: true, dueDate: true },
      }),
      prisma.recall.findMany({
        where: {
          tenantId,
          deletedAt: null,
          dueDate: { lt: today },
          status: { in: ['pending', 'overdue'] },
          workplace: { companyId, deletedAt: null },
        },
        select: { id: true },
      }),
      prisma.workplace.findMany({
        where: { companyId, tenantId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.recall.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ['pending', 'scheduled'] },
          dueDate: { gte: today, lte: todayPlus90 },
          workplace: { companyId, deletedAt: null },
        },
        select: { dueDate: true },
      }),
    ])

  if (!company) return null

  // ── A. Snapshot metrics ──────────────────────────────────────────────────────

  const snapshotSummary = summarizeFisa(
    employees.map((e) => ({ latestExam: e.examinations[0] ?? null })),
    today
  )
  const employeesWithValidFisa = snapshotSummary.valid
  const employeesWithExpiredFisa = snapshotSummary.expired
  const employeesNeverExamined = snapshotSummary.neverExamined
  const expiringIn30Days = snapshotSummary.expiring30
  const expiringIn60Days = snapshotSummary.expiring60
  const expiringIn90Days = snapshotSummary.expiring90

  const totalActiveEmployees = employees.length
  const coverageRate = coverageOf(employeesWithValidFisa, totalActiveEmployees)

  // ── B. Annual metrics ────────────────────────────────────────────────────────

  const signedYearExams = yearExams.filter((e) => e.signedAt !== null)
  const verdictBreakdown = { apt: 0, apt_conditionat: 0, inapt_temporar: 0, inapt: 0 }
  for (const e of signedYearExams) {
    if (e.verdict && e.verdict in verdictBreakdown) {
      verdictBreakdown[e.verdict as keyof typeof verdictBreakdown]++
    }
  }

  const examsWithBothDates = signedYearExams.filter((e) => e.scheduledAt && e.signedAt)
  let avgDaysFromScheduledToSigned: number | null = null
  if (examsWithBothDates.length > 0) {
    const totalDays = examsWithBothDates.reduce((acc, e) => {
      return acc + (e.signedAt!.getTime() - e.scheduledAt!.getTime()) / 86_400_000
    }, 0)
    avgDaysFromScheduledToSigned =
      Math.round((totalDays / examsWithBothDates.length) * 10) / 10
  }

  // ── C. Recall adherence ──────────────────────────────────────────────────────

  const totalRecallsDue = yearRecalls.length
  const recallsCompleted = yearRecalls.filter((r) => r.status === 'completed').length
  const recallsOverdue = overdueRecalls.length
  const adherenceRate =
    totalRecallsDue > 0
      ? Math.round((recallsCompleted / totalRecallsDue) * 1000) / 10
      : null

  // ── D. Monthly trend ─────────────────────────────────────────────────────────

  const yearRange = { key: 'thisYear' as DateRangeKey, from: yearStart, to: yearEnd }
  const buckets = monthBucketsForRange(yearRange)
  const monthlyTrend = buckets.map((bucket) => {
    const examinationsCompleted = yearExams.filter(
      (e) => e.signedAt && e.signedAt >= bucket.from && e.signedAt < bucket.to
    ).length
    const recallsDue = yearRecalls.filter(
      (r) => r.dueDate >= bucket.from && r.dueDate < bucket.to
    ).length
    const bucketRecallsCompleted = yearRecalls.filter(
      (r) =>
        r.status === 'completed' && r.dueDate >= bucket.from && r.dueDate < bucket.to
    ).length
    return {
      month: bucket.month + 1, // 0-indexed → 1-indexed
      year: bucket.year,
      examinationsCompleted,
      recallsDue,
      recallsCompleted: bucketRecallsCompleted,
    }
  })

  // ── E. Workplace breakdown ───────────────────────────────────────────────────

  const wpEmployeeMap = new Map<string, typeof employees>()
  for (const wp of workplaces) {
    wpEmployeeMap.set(wp.id, [])
  }
  for (const emp of employees) {
    const wpId = emp.workplaceAssignments[0]?.workplace?.id
    if (wpId && wpEmployeeMap.has(wpId)) {
      wpEmployeeMap.get(wpId)!.push(emp)
    }
  }

  const workplaceBreakdown = workplaces.map((wp) => {
    const wpEmps = wpEmployeeMap.get(wp.id) ?? []
    let validFisa = 0
    let expired = 0
    let neverExamined = 0
    for (const emp of wpEmps) {
      const status = classifyFisa(emp.examinations[0] ?? null, today)
      if (status === 'never_examined') neverExamined++
      else if (status === 'valid') validFisa++
      else expired++
    }
    const total = wpEmps.length
    return {
      workplaceId: wp.id,
      workplaceName: wp.name,
      totalEmployees: total,
      validFisa,
      expired,
      neverExamined,
      coverageRate: coverageOf(validFisa, total),
    }
  })

  // ── Employee list ────────────────────────────────────────────────────────────

  const employeeList: ComplianceEmployee[] = employees
    .map((emp) => {
      const latestExam = emp.examinations[0] ?? null
      const wp = emp.workplaceAssignments[0]?.workplace ?? null
      const status = classifyFisa(latestExam, today)
      return {
        id: emp.id,
        lastName: emp.lastName,
        firstName: emp.firstName,
        jobTitle: emp.jobTitle,
        workplaceId: wp?.id ?? null,
        workplaceName: wp?.name ?? null,
        lastExamDate: latestExam?.signedAt?.toISOString() ?? null,
        lastVerdict: latestExam?.verdict ?? null,
        nextDueDate: latestExam?.nextExaminationDueDate?.toISOString() ?? null,
        status,
      }
    })
    .sort((a, b) => {
      const wpCmp = (a.workplaceName ?? '').localeCompare(b.workplaceName ?? '', 'ro')
      return wpCmp !== 0 ? wpCmp : a.lastName.localeCompare(b.lastName, 'ro')
    })

  // ── F. Forecast (pessimistic: no renewals) ──────────────────────────────────

  const recallsDueIn30 = upcomingRecalls.filter((r) => r.dueDate <= todayPlus30).length
  const recallsDueIn60 = upcomingRecalls.filter((r) => r.dueDate <= todayPlus60).length
  const projRate = (valid: number): number | null =>
    totalActiveEmployees > 0 ? Math.round((valid / totalActiveEmployees) * 1000) / 10 : null
  const pv30 = Math.max(0, employeesWithValidFisa - expiringIn30Days)
  const pv60 = Math.max(0, employeesWithValidFisa - expiringIn60Days)
  const pv90 = Math.max(0, employeesWithValidFisa - expiringIn90Days)
  const forecast = {
    in30Days: { projectedValid: pv30, projectedRate: projRate(pv30), expiringCount: expiringIn30Days, recallsDue: recallsDueIn30 },
    in60Days: { projectedValid: pv60, projectedRate: projRate(pv60), expiringCount: expiringIn60Days, recallsDue: recallsDueIn60 },
    in90Days: { projectedValid: pv90, projectedRate: projRate(pv90), expiringCount: expiringIn90Days, recallsDue: upcomingRecalls.length },
  }

  return {
    company: { id: company.id, name: company.name, cui: company.cui },
    tenant: { name: tenant?.legalName ?? tenant?.name ?? 'Cabinet' },
    year,
    generatedAt: new Date().toISOString(),
    snapshot: {
      totalActiveEmployees,
      employeesWithValidFisa,
      employeesWithExpiredFisa,
      employeesNeverExamined,
      coverageRate,
      expiringIn30Days,
      expiringIn60Days,
      expiringIn90Days,
    },
    annual: {
      totalExaminationsYear: yearExams.length,
      signedExaminationsYear: signedYearExams.length,
      verdictBreakdown,
      avgDaysFromScheduledToSigned,
    },
    adherence: {
      totalRecallsDue,
      recallsCompleted,
      recallsOverdue,
      adherenceRate,
    },
    monthlyTrend,
    workplaceBreakdown,
    employeeList,
    forecast,
  }
}

// ─── Tenant-wide compliance (all companies, batched) ─────────────────────────

export interface CompanyComplianceSummary {
  companyId: string
  companyName: string
  total: number
  valid: number
  expired: number
  neverExamined: number
  coverageRate: number | null
  expiring30: number
  expiring60: number
  expiring90: number
}

export interface TenantComplianceData {
  companies: CompanyComplianceSummary[]
  totals: FisaSummary & { coverageRate: number | null }
  /** Pessimistic projected coverage % (no renewals), today / +30 / +60 / +90. */
  projectedCoverage: { today: number | null; in30: number | null; in60: number | null; in90: number | null }
}

/**
 * Compliance snapshot for every company of the tenant, in one employee query
 * (+ latest signed exam each), reusing the SAME classifyFisa/summarizeFisa as
 * computeComplianceData — so a company's coverage here equals its per-company
 * report for any year (coverage is a today-based snapshot).
 */
export async function computeTenantCompliance(params: {
  tenantId: string
}): Promise<TenantComplianceData> {
  const { tenantId } = params
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null, archivedAt: null },
    select: {
      company: { select: { id: true, name: true } },
      examinations: {
        where: { deletedAt: null, signedAt: { not: null } },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: { nextExaminationDueDate: true },
      },
    },
  })

  const byCompany = new Map<string, { name: string; emps: Array<{ latestExam: LatestExam | null }> }>()
  for (const e of employees) {
    if (!e.company) continue
    const g = byCompany.get(e.company.id) ?? { name: e.company.name, emps: [] }
    g.emps.push({ latestExam: e.examinations[0] ?? null })
    byCompany.set(e.company.id, g)
  }

  const companies: CompanyComplianceSummary[] = Array.from(byCompany.entries()).map(([id, g]) => {
    const s = summarizeFisa(g.emps, today)
    return {
      companyId: id,
      companyName: g.name,
      total: s.total,
      valid: s.valid,
      expired: s.expired,
      neverExamined: s.neverExamined,
      coverageRate: coverageOf(s.valid, s.total),
      expiring30: s.expiring30,
      expiring60: s.expiring60,
      expiring90: s.expiring90,
    }
  })

  const totalsSummary = summarizeFisa(
    employees.filter((e) => e.company).map((e) => ({ latestExam: e.examinations[0] ?? null })),
    today
  )
  const totals = { ...totalsSummary, coverageRate: coverageOf(totalsSummary.valid, totalsSummary.total) }

  const projRate = (valid: number) => coverageOf(Math.max(0, valid), totalsSummary.total)
  const projectedCoverage = {
    today: totals.coverageRate,
    in30: projRate(totalsSummary.valid - totalsSummary.expiring30),
    in60: projRate(totalsSummary.valid - totalsSummary.expiring60),
    in90: projRate(totalsSummary.valid - totalsSummary.expiring90),
  }

  return { companies, totals, projectedCoverage }
}

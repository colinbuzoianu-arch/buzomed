/**
 * Pure read-model helpers over the sandbox dataset.
 *
 * These reproduce, in memory, the counts and lists the real dashboard gets
 * from Prisma, so the reused presentational components render the same shapes.
 * All "today" math uses local-day bounds, matching how the fixtures lay out
 * their dates (they are built with local Date, not UTC timestamps).
 */

import type { ControlRow } from '@/components/dashboard/controls-card-client'
import { formatDate, type SupportedLocale } from '@/lib/format-date'
import type { SandboxData, SandboxEmployee } from './types'

const DAY = 86_400_000

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export interface DashboardStatsCounts {
  todayExams: number
  thisWeekExams: number
  pendingRecalls: number
  thisMonthExams: number
  employeeCount: number
}

export interface DashboardAlertsCounts {
  overdueRecalls: number
  inProgressExams: number
  unsignedCompleted: number
}

export interface AgendaRow {
  id: string
  scheduledAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  signedAt: Date | null
  status: string
  name: string
  company: string
  type: string
}

export interface DashboardData {
  stats: DashboardStatsCounts
  alerts: DashboardAlertsCounts
  overview: { employeeCount: number; companyCount: number }
  agenda: { rows: AgendaRow[]; extra: number }
  controls: { overdue: ControlRow[]; soon: ControlRow[]; overdueCount: number; soonCount: number }
}

export function employeeName(e: Pick<SandboxEmployee, 'firstName' | 'lastName'>): string {
  return `${e.lastName} ${e.firstName}`
}

export function computeDashboard(data: SandboxData, locale: SupportedLocale): DashboardData {
  const now = data.now
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY)
  const in30 = new Date(todayStart.getTime() + 30 * DAY)
  const monthStart = new Date(todayStart)
  monthStart.setDate(1)

  const companyById = new Map(data.companies.map((c) => [c.id, c]))
  const employeeById = new Map(data.employees.map((e) => [e.id, e]))
  const typeById = new Map(data.examinationTypes.map((t) => [t.id, t]))

  const activeEmployees = data.employees.filter((e) => e.archivedAt === null)

  // ── Stats ────────────────────────────────────────────────────────────────
  const scheduledToday = data.examinations.filter(
    (e) =>
      e.status === 'scheduled' &&
      e.scheduledAt &&
      e.scheduledAt >= todayStart &&
      e.scheduledAt <= todayEnd
  ).length
  const scheduledThisWeek = data.examinations.filter(
    (e) =>
      e.status === 'scheduled' &&
      e.scheduledAt &&
      e.scheduledAt >= todayStart &&
      e.scheduledAt <= weekEnd
  ).length
  const pendingRecallsThisWeek = data.recalls.filter(
    (r) => r.status === 'pending' && r.dueDate >= todayStart && r.dueDate <= weekEnd
  ).length
  const thisMonthExams = data.examinations.filter((e) => e.createdAt >= monthStart).length

  const stats: DashboardStatsCounts = {
    todayExams: scheduledToday,
    thisWeekExams: scheduledThisWeek,
    pendingRecalls: pendingRecallsThisWeek,
    thisMonthExams,
    employeeCount: activeEmployees.length,
  }

  // ── Alerts ─────────────────────────────────────────────────────────────
  const alerts: DashboardAlertsCounts = {
    overdueRecalls: data.recalls.filter((r) => r.status === 'overdue').length,
    inProgressExams: data.examinations.filter((e) => e.status === 'in_progress').length,
    unsignedCompleted: data.examinations.filter(
      (e) => e.status === 'completed' && e.signedAt === null
    ).length,
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  const overview = {
    employeeCount: activeEmployees.length,
    companyCount: data.companies.filter((c) => c.isActive).length,
  }

  // ── Today agenda ─────────────────────────────────────────────────────────
  const MAX_AGENDA = 12
  const agendaAll = data.examinations
    .filter(
      (e) =>
        (e.status === 'scheduled' || e.status === 'in_progress') &&
        e.scheduledAt &&
        e.scheduledAt >= todayStart &&
        e.scheduledAt <= todayEnd
    )
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
  const agendaRows: AgendaRow[] = agendaAll.slice(0, MAX_AGENDA).map((e) => {
    const emp = employeeById.get(e.employeeId)!
    const company = companyById.get(e.companyId)
    const type = typeById.get(e.examinationTypeId)!
    return {
      id: e.id,
      scheduledAt: e.scheduledAt,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      signedAt: e.signedAt,
      status: e.status,
      name: employeeName(emp),
      company: company?.name ?? '—',
      type: locale === 'en' ? type.nameEn : type.nameRo,
    }
  })

  // ── Controls (recall buckets) ────────────────────────────────────────────
  const MAX_CONTROL = 8
  const startMs = todayStart.getTime()
  const toRow = (r: (typeof data.recalls)[number]): ControlRow => {
    const emp = employeeById.get(r.employeeId)!
    const company = companyById.get(r.companyId)
    return {
      id: r.id,
      employeeId: emp.id,
      name: employeeName(emp),
      company: company?.name ?? '—',
      dueDateLabel: formatDate(r.dueDate, 'short', locale),
      days: Math.round((startOfDay(r.dueDate).getTime() - startMs) / DAY),
    }
  }

  const overdueAll = data.recalls
    .filter((r) => r.status === 'overdue' && !employeeById.get(r.employeeId)?.archivedAt)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  const soonAll = data.recalls
    .filter(
      (r) =>
        (r.status === 'pending' || r.status === 'scheduled') &&
        r.dueDate >= todayStart &&
        r.dueDate <= in30 &&
        !employeeById.get(r.employeeId)?.archivedAt
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

  const controls = {
    overdue: overdueAll.slice(0, MAX_CONTROL).map(toRow),
    soon: soonAll.slice(0, MAX_CONTROL).map(toRow),
    overdueCount: overdueAll.length,
    soonCount: soonAll.length,
  }

  return {
    stats,
    alerts,
    overview,
    agenda: { rows: agendaRows, extra: agendaAll.length - agendaRows.length },
    controls,
  }
}

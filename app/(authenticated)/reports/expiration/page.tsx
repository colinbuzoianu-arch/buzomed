import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { RecallStatusBadge } from '@/components/ui/recall-status-badge'
import { formatDate } from '@/lib/format-date'
import {
  EXPIRATION_GROUP_BYS,
  parseExpirationGroupBy,
} from '@/lib/reports/group-by'
import { ChartCard } from '@/components/reports/chart-card'
import { ReportControls } from '@/components/reports/report-controls'
import { ExpirationBarChart, type ExpirationDatum } from '@/components/reports/charts/expiration-bar-chart'

interface PageProps {
  searchParams: Promise<{ horizon?: string; company?: string; group?: string }>
}

const HORIZONS = ['overdue', '30', '60', '90', '180'] as const
type Horizon = (typeof HORIZONS)[number]

function parseHorizon(raw: string | undefined): Horizon {
  return HORIZONS.includes(raw as Horizon) ? (raw as Horizon) : '90'
}

export default async function ExpirationPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) redirect('/')

  const sp = await searchParams
  const horizon = parseHorizon(sp.horizon)
  const companyFilter = sp.company ?? ''
  const groupBy = parseExpirationGroupBy(sp.group)
  const companyWhere = companyFilter ? { workplace: { companyId: companyFilter } } : {}

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cutoff = new Date(today)
  if (horizon !== 'overdue') {
    cutoff.setDate(cutoff.getDate() + Number(horizon))
  }

  // Chart horizon: overdue + next 12 calendar months, independent of the
  // table's horizon selector.
  const chartTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, 1))
  const in30Days = new Date(today)
  in30Days.setUTCDate(in30Days.getUTCDate() + 30)

  const [exams, chartExams, companiesForFilter] = await Promise.all([
    prisma.examination.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        status: { notIn: ['cancelled', 'no_show'] },
        nextExaminationDueDate: {
          not: null,
          ...(horizon === 'overdue' ? { lt: today } : { lt: cutoff }),
        },
        employee: { deletedAt: null },
        ...companyWhere,
      },
      orderBy: { nextExaminationDueDate: 'asc' },
      select: {
        id: true,
        examinationNumber: true,
        createdAt: true,
        nextExaminationDueDate: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    }),
    // All open due exams (overdue + up to 12 months out) for the chart.
    prisma.examination.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        status: { notIn: ['cancelled', 'no_show'] },
        nextExaminationDueDate: { not: null, lt: chartTo },
        employee: { deletedAt: null },
        ...companyWhere,
      },
      select: {
        createdAt: true,
        nextExaminationDueDate: true,
        employee: { select: { id: true } },
        workplace: { select: { company: { select: { id: true, name: true } } } },
      },
    }),
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  // Keep only the most recent exam per employee
  const byEmployee = new Map<string, (typeof exams)[number]>()
  for (const e of exams) {
    const existing = byEmployee.get(e.employee.id)
    if (!existing || e.createdAt > existing.createdAt) {
      byEmployee.set(e.employee.id, e)
    }
  }

  const rows = Array.from(byEmployee.values()).sort((a, b) => {
    const da = a.nextExaminationDueDate!.getTime()
    const db = b.nextExaminationDueDate!.getTime()
    return da - db
  })

  const fromParam = today.toISOString().slice(0, 10)
  const toParam = cutoff.toISOString().slice(0, 10)
  const csvUrl = `/api/reports/expiration?horizon=${horizon}&from=${fromParam}&to=${toParam}`

  // ── Chart: dedup latest exam per employee, then bucket by month or company.
  const chartLatest = new Map<string, (typeof chartExams)[number]>()
  for (const e of chartExams) {
    const ex = chartLatest.get(e.employee.id)
    if (!ex || e.createdAt > ex.createdAt) chartLatest.set(e.employee.id, e)
  }
  const chartMonthFmt = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-US', {
    month: 'short',
    year: '2-digit',
  })
  let chartData: ExpirationDatum[]
  if (groupBy === 'company') {
    const m = new Map<string, { name: string; count: number }>()
    for (const e of chartLatest.values()) {
      const c = e.workplace.company
      const ex = m.get(c.id) ?? { name: c.name, count: 0 }
      ex.count += 1
      m.set(c.id, ex)
    }
    chartData = Array.from(m.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((x) => ({ label: x.name, value: x.count, tone: 'neutral' as const }))
  } else {
    const months: Array<{ y: number; mo: number }> = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))
      months.push({ y: d.getUTCFullYear(), mo: d.getUTCMonth() })
    }
    let overdue = 0
    const counts = new Array<number>(12).fill(0)
    for (const e of chartLatest.values()) {
      const due = e.nextExaminationDueDate
      if (!due) continue
      if (due < today) {
        overdue++
        continue
      }
      const idx = months.findIndex((b) => b.y === due.getUTCFullYear() && b.mo === due.getUTCMonth())
      if (idx >= 0) counts[idx]++
    }
    chartData = [
      { label: t('reports.expiration.overdueBar'), value: overdue, tone: 'overdue', href: '/employees?recall=overdue' },
      ...months.map((b, i) => {
        const bucketFrom = new Date(Date.UTC(b.y, b.mo, 1))
        const soon = bucketFrom < in30Days
        return {
          label: chartMonthFmt.format(bucketFrom),
          value: counts[i],
          tone: (soon ? 'soon' : 'neutral') as 'soon' | 'neutral',
          href: soon ? '/employees?recall=soon' : undefined,
        }
      }),
    ]
  }
  const chartHasData = chartData.some((d) => d.value > 0)
  const chartCsv = {
    headers: [
      groupBy === 'company' ? t('reports.expiration.colCompany') : t('reports.expiration.period'),
      t('reports.expiration.dueCount'),
    ],
    rows: chartData.map((d) => [d.label, d.value] as [string, number]),
  }
  const chartLabels = {
    chart: t('reports.view.chart'),
    table: t('reports.view.table'),
    exportCsv: t('reports.exportCsv'),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('reports.expiration.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('reports.expiration.subtitle')}</p>
      </div>

      {/* Controls: horizon + company + group-by */}
      <ReportControls
        storageKey="reports-expiration"
        primaryParam="horizon"
        primaryOptions={HORIZONS.map((h) => ({ value: h, label: t(`reports.expiration.horizon.${h}`) }))}
        primaryValue={horizon}
        companies={companiesForFilter.map((c) => ({ value: c.id, label: c.name }))}
        companyParam="company"
        companyValue={companyFilter}
        allCompaniesLabel={t('reports.controls.allCompanies')}
        groupParam="group"
        groupOptions={EXPIRATION_GROUP_BYS.map((g) => ({ value: g, label: t(`reports.groupByExp.${g}`) }))}
        groupValue={groupBy}
        groupByLabel={t('reports.controls.groupBy')}
      />

      {/* Distribution chart — overdue + next 12 months (or by company) */}
      {chartHasData && (
        <ChartCard
          title={t('reports.expiration.chartTitle')}
          labels={chartLabels}
          csv={chartCsv}
          filename={`buzomed-scadente-${groupBy}`}
          chart={<ExpirationBarChart data={chartData} valueLabel={t('reports.expiration.dueCount')} />}
          table={
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">
                      {groupBy === 'company'
                        ? t('reports.expiration.colCompany')
                        : t('reports.expiration.period')}
                    </th>
                    <th className="text-right px-4 py-2">{t('reports.expiration.dueCount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {chartData.map((d) => (
                    <tr key={d.label}>
                      <td className="px-4 py-2">{d.label}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{d.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('reports.expiration.empty')}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'angajat' : 'angajati'}
            </span>
            <a
              href={csvUrl}
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted print:hidden"
            >
              {t('reports.expiration.exportCsv')}
            </a>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colWorker')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colCompany')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colWorkplace')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colDue')}</th>
                  <th className="text-right px-4 py-2">{t('reports.expiration.colDaysLeft')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colLastExam')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const due = row.nextExaminationDueDate!
                  const daysLeft = Math.ceil(
                    (due.getTime() - today.getTime()) / 86_400_000
                  )
                  const isOverdue = daysLeft < 0
                  return (
                    <tr key={row.employee.id}>
                      <td className="px-4 py-2 font-medium whitespace-nowrap">
                        <Link
                          href={`/employees/${row.employee.id}`}
                          className="hover:underline"
                        >
                          {row.employee.lastName} {row.employee.firstName}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/companies/${row.workplace.company.id}`}
                          className="hover:underline text-muted-foreground"
                        >
                          {row.workplace.company.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.workplace.name}
                        {row.workplace.department && (
                          <span className="text-xs"> — {row.workplace.department}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                          {formatDate(due, 'medium', locale === 'ro' ? 'ro' : 'en')}
                        </span>
                        {isOverdue && (
                          <span className="ml-2">
                            <RecallStatusBadge status="overdue" />
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${
                          isOverdue ? 'text-destructive' : daysLeft <= 14 ? 'text-amber-600' : ''
                        }`}
                      >
                        {isOverdue ? `+${Math.abs(daysLeft)}` : daysLeft}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        <Link
                          href={`/examinations/${row.id}`}
                          className="hover:underline"
                        >
                          {row.examinationNumber}
                        </Link>
                        <span className="ml-1">
                          ({formatDate(row.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')})
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((row) => {
              const due = row.nextExaminationDueDate!
              const daysLeft = Math.ceil(
                (due.getTime() - today.getTime()) / 86_400_000
              )
              const isOverdue = daysLeft < 0
              return (
                <div
                  key={row.employee.id}
                  className={`border rounded-lg p-3 space-y-2 ${isOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/employees/${row.employee.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.employee.lastName} {row.employee.firstName}
                    </Link>
                    <span
                      className={`text-sm font-semibold whitespace-nowrap tabular-nums ${
                        isOverdue
                          ? 'text-destructive'
                          : daysLeft <= 14
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {isOverdue ? `+${Math.abs(daysLeft)}` : daysLeft}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <Link
                        href={`/companies/${row.workplace.company.id}`}
                        className="hover:underline"
                      >
                        {row.workplace.company.name}
                      </Link>
                      {' · '}
                      {row.workplace.name}
                      {row.workplace.department && ` — ${row.workplace.department}`}
                    </div>
                    <div className={isOverdue ? 'text-destructive font-medium' : ''}>
                      {formatDate(due, 'medium', locale === 'ro' ? 'ro' : 'en')}
                      {isOverdue && (
                        <span className="ml-2 inline-flex">
                          <RecallStatusBadge status="overdue" />
                        </span>
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/examinations/${row.id}`}
                        className="hover:underline"
                      >
                        {row.examinationNumber}
                      </Link>
                      {' '}
                      ({formatDate(row.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')})
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

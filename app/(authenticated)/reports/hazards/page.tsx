import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  parseDateRange,
  resolveDateRange,
} from '@/lib/reports/date-ranges'
import {
  parseRiskProfile,
  RISK_PROFILE_SCHEMA,
} from '@/lib/workplaces/risk-profile'
import { ChartCard } from '@/components/reports/chart-card'
import { ReportControls } from '@/components/reports/report-controls'
import { CATEGORY_COLOR } from '@/components/reports/charts/chart-theme'
import { HorizontalBarChart } from '@/components/reports/charts/horizontal-bar-chart'

interface PageProps {
  searchParams: Promise<{ range?: string; company?: string; group?: string }>
}

const HAZARD_GROUP_BYS = ['hazard', 'category'] as const

export default async function HazardsPage({ searchParams }: PageProps) {
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
  const rangeKey = parseDateRange(sp.range)
  const range = resolveDateRange(rangeKey)
  const companyFilter = sp.company ?? ''
  const groupBy: (typeof HAZARD_GROUP_BYS)[number] = sp.group === 'category' ? 'category' : 'hazard'

  const [workplaces, companiesForFilter] = await Promise.all([
    prisma.workplace.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      isActive: true,
      ...(companyFilter ? { companyId: companyFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      riskProfile: true,
      company: { select: { id: true, name: true } },
      employeeAssignments: {
        where: { isCurrent: true, employee: { deletedAt: null } },
        select: { employeeId: true },
      },
      examinations: {
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
          status: { notIn: ['cancelled', 'no_show'] },
        },
        select: { id: true },
      },
    },
    }),
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  // Build aggregation: category → hazardKey → { workplaceIds, workerIds, examCount }
  type HazardAgg = {
    category: string
    hazardKey: string
    workplaceIds: Set<string>
    workerIds: Set<string>
    examCount: number
  }

  const hazardMap = new Map<string, HazardAgg>()

  for (const wp of workplaces) {
    const rp = parseRiskProfile(wp.riskProfile)
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (!entry?.present) continue

        const key = `${category}:${hazardKey}`
        const agg = hazardMap.get(key) ?? {
          category,
          hazardKey,
          workplaceIds: new Set(),
          workerIds: new Set(),
          examCount: 0,
        }
        agg.workplaceIds.add(wp.id)
        for (const a of wp.employeeAssignments) agg.workerIds.add(a.employeeId)
        agg.examCount += wp.examinations.length
        hazardMap.set(key, agg)
      }
    }
  }

  const rows = Array.from(hazardMap.values())
    .sort((a, b) => {
      const catOrder = RISK_PROFILE_SCHEMA.findIndex((s) => s.category === a.category)
      const catOrderB = RISK_PROFILE_SCHEMA.findIndex((s) => s.category === b.category)
      if (catOrder !== catOrderB) return catOrder - catOrderB
      return b.workerIds.size - a.workerIds.size
    })

  // ── Chart data (bars coloured by hazard category) ───────────────────────────
  const hazardChart = rows.map((r) => ({
    label: t(`workplaces.form.hazardName.${r.hazardKey}`),
    value: r.workerIds.size,
    color: CATEGORY_COLOR[r.category],
  }))
  const catWorkers = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = catWorkers.get(r.category) ?? new Set<string>()
    for (const w of r.workerIds) set.add(w)
    catWorkers.set(r.category, set)
  }
  const presentCats = RISK_PROFILE_SCHEMA.filter((s) => catWorkers.has(s.category))
  const categoryChart = presentCats.map((s) => ({
    label: t(`workplaces.form.hazardCategory.${s.category}`),
    value: (catWorkers.get(s.category) ?? new Set()).size,
    color: CATEGORY_COLOR[s.category],
  }))
  const chartData = groupBy === 'category' ? categoryChart : hazardChart
  const chartLegend = presentCats.map((s) => ({
    label: t(`workplaces.form.hazardCategory.${s.category}`),
    color: CATEGORY_COLOR[s.category],
  }))
  const chartLabels = {
    chart: t('reports.view.chart'),
    table: t('reports.view.table'),
    exportCsv: t('reports.exportCsv'),
  }
  const hazardCsv = {
    headers: [
      t('reports.hazards.colCategory'),
      t('reports.hazards.colHazard'),
      t('reports.hazards.colWorkplaces'),
      t('reports.hazards.colWorkers'),
      t('reports.hazards.colExams'),
    ],
    rows: rows.map((r) => [
      t(`workplaces.form.hazardCategory.${r.category}`),
      t(`workplaces.form.hazardName.${r.hazardKey}`),
      r.workplaceIds.size,
      r.workerIds.size,
      r.examCount,
    ] as Array<string | number>),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('reports.hazards.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('reports.hazards.subtitle')}</p>
      </div>

      {/* Controls: range + company + group-by (hazard/category) */}
      <ReportControls
        storageKey="reports-hazards"
        primaryParam="range"
        primaryOptions={ALL_DATE_RANGES.map((key) => ({ value: key, label: t(`reports.range.${key}`) }))}
        primaryValue={rangeKey}
        companies={companiesForFilter.map((c) => ({ value: c.id, label: c.name }))}
        companyParam="company"
        companyValue={companyFilter}
        allCompaniesLabel={t('reports.controls.allCompanies')}
        groupParam="group"
        groupOptions={HAZARD_GROUP_BYS.map((g) => ({ value: g, label: t(`reports.hazards.groupBy.${g}`) }))}
        groupValue={groupBy}
        groupByLabel={t('reports.controls.groupBy')}
        trailing={
          <a
            href={`/api/reports/hazards-export?range=${rangeKey}`}
            download
            className="inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-[hsl(var(--surface-muted))] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 2v7m0 0L4.5 6.5M7 9l2.5-2.5M2 11h10"/>
            </svg>
            {t('reports.hazards.exportCsv')}
          </a>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('reports.hazards.empty')}</p>
        </div>
      ) : (
        <ChartCard
          title={t('reports.hazards.title')}
          labels={chartLabels}
          csv={hazardCsv}
          filename={`buzomed-noxe-${rangeKey}`}
          chart={<HorizontalBarChart data={chartData} valueLabel={t('reports.hazards.colWorkers')} legend={chartLegend} />}
          table={
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">{t('reports.hazards.colCategory')}</th>
                    <th className="text-left px-4 py-2">{t('reports.hazards.colHazard')}</th>
                    <th className="text-right px-4 py-2">{t('reports.hazards.colWorkplaces')}</th>
                    <th className="text-right px-4 py-2">{t('reports.hazards.colWorkers')}</th>
                    <th className="text-right px-4 py-2">{t('reports.hazards.colExams')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={`${row.category}:${row.hazardKey}`}>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {t(`workplaces.form.hazardCategory.${row.category}`)}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {t(`workplaces.form.hazardName.${row.hazardKey}`)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.workplaceIds.size}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{row.workerIds.size}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.examCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </div>
  )
}

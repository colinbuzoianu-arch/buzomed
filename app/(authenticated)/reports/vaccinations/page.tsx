import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { ALL_DATE_RANGES, parseDateRange, resolveDateRange } from '@/lib/reports/date-ranges'
import { formatDate } from '@/lib/format-date'
import { EmptyState } from '@/components/ui/empty-state'
import { ChartCard } from '@/components/reports/chart-card'
import { ReportControls } from '@/components/reports/report-controls'
import { HorizontalBarChart } from '@/components/reports/charts/horizontal-bar-chart'

interface PageProps {
  searchParams: Promise<{ range?: string; company?: string }>
}

const ROUTE_LABELS: Record<string, string> = {
  intramuscular: 'Intramuscular',
  subcutaneous: 'Subcutanat',
  oral: 'Oral',
  intranasal: 'Intranazal',
  other: 'Altul',
}

export default async function VaccinationsReportPage({ searchParams }: PageProps) {
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

  const [vaccinations, companiesForFilter] = await Promise.all([
    prisma.vaccination.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      administrationDate: { gte: range.from, lt: range.to },
      ...(companyFilter ? { employee: { companyId: companyFilter } } : {}),
    },
    orderBy: [
      { employee: { lastName: 'asc' } },
      { administrationDate: 'desc' },
    ],
    select: {
      id: true,
      vaccineName: true,
      vaccineCode: true,
      doseNumber: true,
      administrationDate: true,
      nextDoseDueDate: true,
      reactionsObserved: true,
      administrationRoute: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          company: { select: { id: true, name: true } },
        },
      },
      administeredBy: { select: { firstName: true, lastName: true } },
    },
    }),
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const today = new Date()

  const exportHref = `/api/reports/vaccinations-export?range=${rangeKey}`

  // ── Chart: count per vaccine type ───────────────────────────────────────────
  const vaccineCounts = new Map<string, number>()
  for (const v of vaccinations) {
    vaccineCounts.set(v.vaccineName, (vaccineCounts.get(v.vaccineName) ?? 0) + 1)
  }
  const vaccineChart = Array.from(vaccineCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  const chartLabels = {
    chart: t('reports.view.chart'),
    table: t('reports.view.table'),
    exportCsv: t('reports.exportCsv'),
  }
  const vaccineCsv = {
    headers: [t('reports.vaccinations.colVaccine'), t('reports.vaccinations.colDose')],
    rows: vaccineChart.map((v) => [v.label, v.value] as Array<string | number>),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t('reports.vaccinations.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('reports.vaccinations.subtitle')}</p>
      </div>

      {/* Controls: range + company */}
      <ReportControls
        storageKey="reports-vaccinations"
        primaryParam="range"
        primaryOptions={ALL_DATE_RANGES.map((key) => ({ value: key, label: t(`reports.range.${key}`) }))}
        primaryValue={rangeKey}
        companies={companiesForFilter.map((c) => ({ value: c.id, label: c.name }))}
        companyParam="company"
        companyValue={companyFilter}
        allCompaniesLabel={t('reports.controls.allCompanies')}
        groupParam="group"
        groupOptions={[]}
        groupValue=""
        groupByLabel={t('reports.controls.groupBy')}
        trailing={
          <a
            href={exportHref}
            download
            className="inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-[hsl(var(--surface-muted))] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 2v7m0 0L4.5 6.5M7 9l2.5-2.5M2 11h10"/>
            </svg>
            {t('reports.vaccinations.exportCsv')}
          </a>
        }
      />

      {vaccinations.length === 0 ? (
        <EmptyState
          illustration="generic"
          title={t('reports.vaccinations.emptyTitle')}
          description={t('reports.vaccinations.emptyDescription')}
        />
      ) : (
        <ChartCard
          title={t('reports.vaccinations.title')}
          labels={chartLabels}
          csv={vaccineCsv}
          filename={`buzomed-vaccinari-${rangeKey}`}
          chart={<HorizontalBarChart data={vaccineChart} valueLabel={t('reports.vaccinations.colDose')} />}
          table={
          <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colEmployee')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colCompany')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colVaccine')}</th>
                <th className="text-right px-4 py-2">{t('reports.vaccinations.colDose')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colDate')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colNextDue')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colReactions')}</th>
                <th className="text-left px-4 py-2">{t('reports.vaccinations.colPractitioner')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vaccinations.map((v) => {
                const isOverdue = v.nextDoseDueDate && new Date(v.nextDoseDueDate) < today
                return (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2">
                      <Link
                        href={`/employees/${v.employee.id}?tab=vaccinations`}
                        className="font-medium hover:underline"
                      >
                        {v.employee.lastName} {v.employee.firstName}
                      </Link>
                      {v.employee.jobTitle && (
                        <div className="text-xs text-muted-foreground">{v.employee.jobTitle}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {v.employee.company ? (
                        <Link href={`/companies/${v.employee.company.id}`} className="hover:underline">
                          {v.employee.company.name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{v.vaccineName}</span>
                      {v.vaccineCode && (
                        <span className="ml-1.5 text-[10px] font-mono text-muted-foreground border rounded px-1">
                          {v.vaccineCode}
                        </span>
                      )}
                      {v.administrationRoute && (
                        <div className="text-xs text-muted-foreground">
                          {ROUTE_LABELS[v.administrationRoute] ?? v.administrationRoute}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{v.doseNumber}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(v.administrationDate, 'medium', locale === 'ro' ? 'ro' : 'en')}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {v.nextDoseDueDate ? (
                        <span className={isOverdue ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                          {formatDate(v.nextDoseDueDate, 'medium', locale === 'ro' ? 'ro' : 'en')}
                          {isOverdue && ` ⚠ ${t('reports.vaccinations.nextDueOverdue')}`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {v.reactionsObserved || '—'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {v.administeredBy
                        ? `Dr. ${v.administeredBy.lastName} ${v.administeredBy.firstName}`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          }
        />
      )}
    </div>
  )
}

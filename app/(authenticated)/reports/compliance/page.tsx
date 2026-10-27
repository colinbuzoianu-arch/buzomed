import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { computeTenantCompliance } from '@/lib/reports/compliance-data'
import { EmptyState } from '@/components/ui/empty-state'
import { ComplianceBreakdown } from '@/components/reports/compliance-breakdown'
import { ChartThemeStyle, VERDICT_COLOR } from '@/components/reports/charts/chart-theme'
import { ProgressBarList } from '@/components/reports/charts/progress-bar-list'

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export const metadata = { title: 'Conformitate — Buzomed' }

export default async function ComplianceReportPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')
  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')
  const hasReportingRole = user.roles.some((r) => r === 'practitioner' || r === 'practice_admin')
  if (!hasReportingRole) redirect('/')

  const sp = await searchParams
  const currentYear = new Date().getUTCFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : currentYear

  const data = await computeTenantCompliance({ tenantId: user.tenantId })

  const pct = (v: number | null) => (v == null ? '—' : `${v}%`)

  const projectedData = [
    { label: t('reports.compliance.today'), value: data.projectedCoverage.today ?? 0, color: VERDICT_COLOR.apt },
    { label: t('reports.compliance.in30'), value: data.projectedCoverage.in30 ?? 0, color: VERDICT_COLOR.apt },
    { label: t('reports.compliance.in60'), value: data.projectedCoverage.in60 ?? 0, color: VERDICT_COLOR.apt },
    { label: t('reports.compliance.in90'), value: data.projectedCoverage.in90 ?? 0, color: VERDICT_COLOR.apt },
  ]

  return (
    <div className="space-y-6">
      <ChartThemeStyle />
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t('reports.compliance.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('reports.compliance.subtitle')}</p>
      </div>

      {/* Year selector */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground self-center mr-1">{t('reports.compliance.year')}:</span>
        {years.map((y) => (
          <Link
            key={y}
            href={`/reports/compliance?year=${y}`}
            className={`px-3 py-1 rounded-md border transition-colors ${
              year === y ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {data.companies.length === 0 ? (
        <EmptyState
          illustration="reports"
          title={t('reports.compliance.emptyTitle')}
          description={t('reports.compliance.emptyDescription')}
        />
      ) : (
        <>
          {/* KPI cards + projected coverage */}
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 content-start">
              <Kpi label={t('reports.compliance.coverage')} value={pct(data.totals.coverageRate)} valueColor="text-emerald-700" />
              <Kpi label={t('reports.compliance.valid')} value={data.totals.valid} valueColor="text-emerald-700" />
              <Kpi label={t('reports.compliance.expired')} value={data.totals.expired} valueColor="text-red-700" />
              <Kpi label={t('reports.compliance.never')} value={data.totals.neverExamined} valueColor="text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">{t('reports.compliance.projectedTitle')}</h2>
              <ProgressBarList data={projectedData} valueSuffix="%" />
            </div>
          </div>

          <ComplianceBreakdown
            companies={data.companies}
            year={year}
            labels={{
              title: t('reports.compliance.perCompanyTitle'),
              company: t('reports.perCompany.company'),
              employees: t('reports.compliance.employees'),
              coverage: t('reports.compliance.coverage'),
              valid: t('reports.compliance.valid'),
              expired: t('reports.compliance.expired'),
              never: t('reports.compliance.never'),
              sortLabel: t('reports.compliance.sortLabel'),
              sortCoverage: t('reports.compliance.sortCoverage'),
              sortName: t('reports.compliance.sortName'),
              sortEmployees: t('reports.compliance.sortEmployees'),
              chart: t('reports.view.chart'),
              table: t('reports.view.table'),
              exportCsv: t('reports.exportCsv'),
            }}
          />
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, valueColor = 'text-foreground' }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</div>
    </div>
  )
}

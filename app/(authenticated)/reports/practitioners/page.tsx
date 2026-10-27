import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  monthBucketsForRange,
  parseDateRange,
  resolveDateRange,
} from '@/lib/reports/date-ranges'
import { EmptyState } from '@/components/ui/empty-state'
import { ChartCard } from '@/components/reports/chart-card'
import { ReportControls } from '@/components/reports/report-controls'
import { StackedBarChart, type VerdictRow } from '@/components/reports/charts/stacked-bar-chart'

interface PageProps {
  searchParams: Promise<{ range?: string; group?: string }>
}

const PRACT_GROUP_BYS = ['practitioner', 'month'] as const

export default async function PractitionersReportPage({ searchParams }: PageProps) {
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
  const groupBy: (typeof PRACT_GROUP_BYS)[number] = sp.group === 'month' ? 'month' : 'practitioner'

  const practitioners = await prisma.user.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      roles: { hasSome: ['practitioner', 'practice_admin'] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: true,
      examinationsAsPractitioner: {
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
        },
        select: { id: true, status: true, verdict: true, signedAt: true },
      },
    },
  })

  const rows = practitioners
    .map(p => ({
      id: p.id,
      name: `${p.lastName} ${p.firstName}`,
      role: p.roles.includes('practice_admin') ? 'Medic primar' : 'Medic',
      total: p.examinationsAsPractitioner.length,
      signed: p.examinationsAsPractitioner.filter(e => e.signedAt !== null).length,
      apt: p.examinationsAsPractitioner.filter(e => e.verdict === 'apt').length,
      apt_conditionat: p.examinationsAsPractitioner.filter(e => e.verdict === 'apt_conditionat').length,
      inapt_temporar: p.examinationsAsPractitioner.filter(e => e.verdict === 'inapt_temporar').length,
      inapt: p.examinationsAsPractitioner.filter(e => e.verdict === 'inapt').length,
    }))
    .sort((a, b) => b.total - a.total)

  const totalExams = rows.reduce((s, r) => s + r.total, 0)
  const exportHref = `/api/reports/practitioners-export?range=${rangeKey}`

  // ── Chart data ──────────────────────────────────────────────────────────────
  const verdictLabels = {
    apt: t('reports.practitioners.colApt'),
    apt_conditionat: t('reports.practitioners.colAptConditionat'),
    inapt_temporar: t('reports.practitioners.colInaptTemporar'),
    inapt: t('reports.practitioners.colInapt'),
  }
  const practitionerChart: VerdictRow[] = rows.map((r) => ({
    label: r.name,
    apt: r.apt,
    apt_conditionat: r.apt_conditionat,
    inapt_temporar: r.inapt_temporar,
    inapt: r.inapt,
  }))
  // Month grouping: signed exams across all practitioners, stacked by verdict.
  const monthFmt = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-US', { year: 'numeric', month: 'short' })
  const allExams = practitioners.flatMap((p) => p.examinationsAsPractitioner)
  const monthChart: VerdictRow[] = monthBucketsForRange(range).map((b) => {
    const inB = allExams.filter((e) => e.signedAt && e.signedAt >= b.from && e.signedAt < b.to)
    return {
      label: monthFmt.format(new Date(Date.UTC(b.year, b.month, 1))),
      apt: inB.filter((e) => e.verdict === 'apt').length,
      apt_conditionat: inB.filter((e) => e.verdict === 'apt_conditionat').length,
      inapt_temporar: inB.filter((e) => e.verdict === 'inapt_temporar').length,
      inapt: inB.filter((e) => e.verdict === 'inapt').length,
    }
  })
  const chartData = groupBy === 'month' ? monthChart : practitionerChart
  const chartLabels = {
    chart: t('reports.view.chart'),
    table: t('reports.view.table'),
    exportCsv: t('reports.exportCsv'),
  }
  const practCsv = {
    headers: [
      t('reports.practitioners.colPractitioner'),
      t('reports.practitioners.colRole'),
      t('reports.practitioners.colTotal'),
      t('reports.practitioners.colSigned'),
      verdictLabels.apt,
      verdictLabels.apt_conditionat,
      verdictLabels.inapt_temporar,
      verdictLabels.inapt,
    ],
    rows: rows.map((r) => [r.name, r.role, r.total, r.signed, r.apt, r.apt_conditionat, r.inapt_temporar, r.inapt] as Array<string | number>),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t('reports.practitioners.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('reports.practitioners.subtitle')}</p>
      </div>

      {/* Controls: range + group-by (practitioner/month) */}
      <ReportControls
        storageKey="reports-practitioners"
        primaryParam="range"
        primaryOptions={ALL_DATE_RANGES.map((key) => ({ value: key, label: t(`reports.range.${key}`) }))}
        primaryValue={rangeKey}
        companies={[]}
        companyParam="company"
        companyValue=""
        allCompaniesLabel={t('reports.controls.allCompanies')}
        groupParam="group"
        groupOptions={PRACT_GROUP_BYS.map((g) => ({ value: g, label: t(`reports.practitioners.groupBy.${g}`) }))}
        groupValue={groupBy}
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
            {t('reports.practitioners.exportCsv')}
          </a>
        }
      />

      {totalExams === 0 ? (
        <EmptyState
          illustration="generic"
          title={t('reports.practitioners.emptyTitle')}
          description={t('reports.practitioners.emptyDescription')}
        />
      ) : (
        <ChartCard
          title={t('reports.practitioners.title')}
          labels={chartLabels}
          csv={practCsv}
          filename={`buzomed-medici-${rangeKey}`}
          chart={<StackedBarChart data={chartData} labels={verdictLabels} totalLabel={t('reports.practitioners.colTotal')} />}
          table={
          <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('reports.practitioners.colPractitioner')}</th>
                  <th className="text-left px-4 py-2">{t('reports.practitioners.colRole')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colTotal')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colSigned')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colApt')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colAptConditionat')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colInaptTemporar')}</th>
                  <th className="text-right px-4 py-2">{t('reports.practitioners.colInapt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.role}</td>
                    <td className="px-4 py-2 text-right font-semibold">{r.total}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{r.signed}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{r.apt}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-700">{r.apt_conditionat}</td>
                    <td className="px-4 py-2 text-right font-semibold text-orange-700">{r.inapt_temporar}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700">{r.inapt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.role}</div>
                </div>
                <div className="grid grid-cols-4 gap-x-2 text-xs">
                  {[
                    { label: t('reports.practitioners.colTotal'), value: r.total, color: 'text-foreground' },
                    { label: t('reports.practitioners.colApt'), value: r.apt, color: 'text-emerald-700' },
                    { label: t('reports.practitioners.colAptConditionat'), value: r.apt_conditionat, color: 'text-amber-700' },
                    { label: t('reports.practitioners.colInapt'), value: r.inapt + r.inapt_temporar, color: 'text-red-700' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{label}</div>
                      <div className={`font-bold text-base ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </>
          }
        />
      )}
    </div>
  )
}

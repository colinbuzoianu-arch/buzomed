import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  parseDateRange,
  resolveDateRange,
  monthBucketsForRange,
} from '@/lib/reports/date-ranges'
import { prisma } from '@/lib/prisma'

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  // Reports are practitioner/admin-only. Assistants get bounced.
  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) redirect('/')

  const params = await searchParams
  const rangeKey = parseDateRange(params.range)
  const range = resolveDateRange(rangeKey)

  // Same query path as the API, inlined. Single page; no point doing
  // an HTTP round-trip when this is a server component.
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      createdAt: { gte: range.from, lt: range.to },
    },
    select: {
      id: true,
      verdict: true,
      status: true,
      signedAt: true,
      createdAt: true,
      workplace: {
        select: {
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  const overdueRecalls = await prisma.recall.count({
    where: {
      tenantId: user.tenantId,
      status: 'overdue',
      deletedAt: null,
      OR: [
        { createdFromExaminationId: null },
        { createdFromExamination: { deletedAt: null } },
      ],
    },
  })

  // Headline counts.
  const headline = {
    total: examinations.length,
    apt: examinations.filter((e) => e.verdict === 'apt').length,
    apt_conditionat: examinations.filter(
      (e) => e.verdict === 'apt_conditionat'
    ).length,
    inapt_temporar: examinations.filter((e) => e.verdict === 'inapt_temporar')
      .length,
    inapt: examinations.filter((e) => e.verdict === 'inapt').length,
    signed: examinations.filter((e) => e.signedAt !== null).length,
    unsigned: examinations.filter((e) => e.signedAt === null).length,
  }

  // Monthly trend.
  const buckets = monthBucketsForRange(range)
  const monthlyTrend = buckets.map((b) => {
    const inB = examinations.filter(
      (e) => e.createdAt >= b.from && e.createdAt < b.to
    )
    return {
      year: b.year,
      month: b.month,
      total: inB.length,
      apt: inB.filter((e) => e.verdict === 'apt').length,
      apt_conditionat: inB.filter((e) => e.verdict === 'apt_conditionat')
        .length,
      inapt_temporar: inB.filter((e) => e.verdict === 'inapt_temporar').length,
      inapt: inB.filter((e) => e.verdict === 'inapt').length,
    }
  })

  // Per-company breakdown.
  const perCompanyMap = new Map<
    string,
    {
      companyId: string
      companyName: string
      total: number
      apt: number
      apt_conditionat: number
      inapt_temporar: number
      inapt: number
    }
  >()
  for (const e of examinations) {
    const c = e.workplace.company
    const existing = perCompanyMap.get(c.id) ?? {
      companyId: c.id,
      companyName: c.name,
      total: 0,
      apt: 0,
      apt_conditionat: 0,
      inapt_temporar: 0,
      inapt: 0,
    }
    existing.total += 1
    if (e.verdict === 'apt') existing.apt += 1
    if (e.verdict === 'apt_conditionat') existing.apt_conditionat += 1
    if (e.verdict === 'inapt_temporar') existing.inapt_temporar += 1
    if (e.verdict === 'inapt') existing.inapt += 1
    perCompanyMap.set(c.id, existing)
  }
  const perCompany = Array.from(perCompanyMap.values()).sort(
    (a, b) => b.total - a.total
  )

  const monthFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { year: 'numeric', month: 'short' }
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('reports.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('reports.subtitle')}</p>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2 text-sm">
        {ALL_DATE_RANGES.map((key) => {
          const active = rangeKey === key
          return (
            <Link
              key={key}
              href={`/reports?range=${key}`}
              className={`px-3 py-1 rounded-md border ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              }`}
            >
              {t(`reports.range.${key}`)}
            </Link>
          )
        })}
      </div>

      {/* Headline */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('reports.headline.title')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('reports.headline.total')} value={headline.total} />
          <StatCard
            label={t('reports.headline.signed')}
            value={headline.signed}
            sublabel={
              headline.total > 0
                ? `${Math.round((headline.signed / headline.total) * 100)}%`
                : null
            }
          />
          <StatCard label={t('reports.headline.apt')} value={headline.apt} />
          <StatCard
            label={t('reports.headline.aptConditionat')}
            value={headline.apt_conditionat}
          />
          <StatCard
            label={t('reports.headline.inapt_temporar')}
            value={headline.inapt_temporar}
          />
          <StatCard
            label={t('reports.headline.inapt')}
            value={headline.inapt}
          />
          <Link href="/recalls?horizon=overdue" className="block">
            <StatCard
              label={t('reports.headline.overdueRecalls')}
              value={overdueRecalls}
              tone={overdueRecalls > 0 ? 'destructive' : 'default'}
            />
          </Link>
        </div>
      </section>

      {/* Monthly trend */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('reports.monthly.title')}
        </h2>
        {monthlyTrend.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('reports.empty')}
          </p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t('reports.monthly.month')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.total')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.apt')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.aptConditionat')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.inapt_temporar')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.inapt')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthlyTrend.map((m) => {
                  const label = monthFormatter.format(new Date(Date.UTC(m.year, m.month, 1)))
                  return (
                    <tr key={`${m.year}-${m.month}`}>
                      <td className="px-4 py-2 capitalize">{label}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {m.total}
                      </td>
                      <td className="px-4 py-2 text-right">{m.apt}</td>
                      <td className="px-4 py-2 text-right">
                        {m.apt_conditionat}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.inapt_temporar}
                      </td>
                      <td className="px-4 py-2 text-right">{m.inapt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-company breakdown */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('reports.perCompany.title')}
        </h2>
        {perCompany.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('reports.empty')}
          </p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t('reports.perCompany.company')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.total')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.apt')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.aptConditionat')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.inapt_temporar')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.headline.inapt')}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t('reports.perCompany.report')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {perCompany.map((c) => (
                  <tr key={c.companyId}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/companies/${c.companyId}`}
                        className="hover:underline font-medium"
                      >
                        {c.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {c.total}
                    </td>
                    <td className="px-4 py-2 text-right">{c.apt}</td>
                    <td className="px-4 py-2 text-right">
                      {c.apt_conditionat}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.inapt_temporar}
                    </td>
                    <td className="px-4 py-2 text-right">{c.inapt}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/companies/${c.companyId}/report?range=${rangeKey}`}
                        className="text-primary hover:underline text-xs"
                      >
                        {t('reports.perCompany.viewDetail')} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel = null,
  tone = 'default',
}: {
  label: string
  value: number
  sublabel?: string | null
  tone?: 'default' | 'destructive'
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        tone === 'destructive' && value > 0
          ? 'border-destructive bg-destructive/5'
          : ''
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-2xl font-bold mt-1 ${
          tone === 'destructive' && value > 0 ? 'text-destructive' : ''
        }`}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
      )}
    </div>
  )
}

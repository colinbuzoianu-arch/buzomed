import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
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
  const [examinations, invoices] = await Promise.all([
    prisma.examination.findMany({
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
        practitioner: { select: { id: true, firstName: true, lastName: true } },
        workplace: {
          select: {
            company: { select: { id: true, name: true } },
          },
        },
      },
    }),

    caps.canWriteAdministrative
      ? prisma.invoice.findMany({
          where: {
            tenantId: user.tenantId,
            deletedAt: null,
            status: { notIn: ['draft', 'cancelled'] },
            issuedAt: { gte: range.from, lt: range.to },
          },
          select: {
            id: true,
            status: true,
            total: true,
            company: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ])

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

  // Per-practitioner breakdown
  const perPractitionerMap = new Map<
    string,
    { name: string; total: number; apt: number; apt_conditionat: number; inapt: number }
  >()
  for (const e of examinations) {
    const key = e.practitioner?.id ?? '__none__'
    const name = e.practitioner
      ? `${e.practitioner.lastName} ${e.practitioner.firstName}`
      : t('reports.perPractitioner.noPractitioner')
    const existing = perPractitionerMap.get(key) ?? {
      name,
      total: 0,
      apt: 0,
      apt_conditionat: 0,
      inapt: 0,
    }
    existing.total += 1
    if (e.verdict === 'apt') existing.apt += 1
    if (e.verdict === 'apt_conditionat') existing.apt_conditionat += 1
    if (e.verdict === 'inapt' || e.verdict === 'inapt_temporar') existing.inapt += 1
    perPractitionerMap.set(key, existing)
  }
  const perPractitioner = Array.from(perPractitionerMap.values()).sort(
    (a, b) => b.total - a.total
  )

  // Revenue per company
  const revenueMap = new Map<
    string,
    { companyId: string; companyName: string; invoiced: number; paid: number }
  >()
  for (const inv of invoices) {
    const existing = revenueMap.get(inv.company.id) ?? {
      companyId: inv.company.id,
      companyName: inv.company.name,
      invoiced: 0,
      paid: 0,
    }
    existing.invoiced += Number(inv.total)
    if (inv.status === 'paid') existing.paid += Number(inv.total)
    revenueMap.set(inv.company.id, existing)
  }
  const revenueRows = Array.from(revenueMap.values()).sort(
    (a, b) => b.invoiced - a.invoiced
  )
  const revenueTotals = revenueRows.reduce(
    (acc, r) => ({ invoiced: acc.invoiced + r.invoiced, paid: acc.paid + r.paid }),
    { invoiced: 0, paid: 0 }
  )

  const monthFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { year: 'numeric', month: 'short' }
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('reports.title')}</h1>
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
          <StatCard label={t('reports.headline.apt')} value={headline.apt} valueColor="text-emerald-700" />
          <StatCard
            label={t('reports.headline.aptConditionat')}
            value={headline.apt_conditionat}
            valueColor="text-amber-700"
          />
          <StatCard
            label={t('reports.headline.inapt_temporar')}
            value={headline.inapt_temporar}
            valueColor="text-orange-700"
          />
          <StatCard
            label={t('reports.headline.inapt')}
            value={headline.inapt}
            valueColor="text-red-700"
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
          <EmptyState
            illustration="reports"
            title={t('reports.emptyTitle')}
            description={t('reports.emptyDescription')}
          />
        ) : (
          <>
            <div className="hidden md:block border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
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
                        <td className="px-4 py-2 text-right font-semibold text-foreground">
                          {m.total}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{m.apt}</td>
                        <td className="px-4 py-2 text-right font-semibold text-amber-700">
                          {m.apt_conditionat}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-orange-700">
                          {m.inapt_temporar}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-red-700">{m.inapt}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-2">
              {monthlyTrend.map((m) => {
                const label = monthFormatter.format(new Date(Date.UTC(m.year, m.month, 1)))
                return (
                  <div key={`${m.year}-${m.month}`} className="border rounded-lg p-3">
                    <div className="font-medium capitalize mb-2">{label}</div>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                      <div className="text-center">
                        <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.total')}</div>
                        <div className="font-bold text-base">{m.total}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.apt')}</div>
                        <div className="font-bold text-base text-emerald-700">{m.apt}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.aptConditionat')}</div>
                        <div className="font-bold text-base text-amber-700">{m.apt_conditionat}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.inapt_temporar')}</div>
                        <div className="font-bold text-base text-orange-700">{m.inapt_temporar}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.inapt')}</div>
                        <div className="font-bold text-base text-red-700">{m.inapt}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Per-company breakdown */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('reports.perCompany.title')}
        </h2>
        {perCompany.length === 0 ? (
          <EmptyState
            illustration="reports"
            title={t('reports.emptyTitle')}
            description={t('reports.emptyDescription')}
          />
        ) : (
          <>
            <div className="hidden md:block border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
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
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {c.total}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{c.apt}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-700">
                      {c.apt_conditionat}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-orange-700">
                      {c.inapt_temporar}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700">{c.inapt}</td>
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

            <div className="md:hidden space-y-2">
              {perCompany.map((c) => (
                <div key={c.companyId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/companies/${c.companyId}`} className="font-medium hover:underline">
                      {c.companyName}
                    </Link>
                    <Link
                      href={`/companies/${c.companyId}/report?range=${rangeKey}`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      {t('reports.perCompany.viewDetail')} →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                    <div className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.total')}</div>
                      <div className="font-bold text-base">{c.total}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.apt')}</div>
                      <div className="font-bold text-base text-emerald-700">{c.apt}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.aptConditionat')}</div>
                      <div className="font-bold text-base text-amber-700">{c.apt_conditionat}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.inapt_temporar')}</div>
                      <div className="font-bold text-base text-orange-700">{c.inapt_temporar}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.headline.inapt')}</div>
                      <div className="font-bold text-base text-red-700">{c.inapt}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {/* Per-practitioner */}
      {perPractitioner.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {t('reports.perPractitioner.title')}
          </h2>
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('reports.perPractitioner.colName')}</th>
                  <th className="text-right px-4 py-2">{t('reports.perPractitioner.colTotal')}</th>
                  <th className="text-right px-4 py-2">{t('reports.perPractitioner.colApt')}</th>
                  <th className="text-right px-4 py-2">{t('reports.perPractitioner.colAptConditionat')}</th>
                  <th className="text-right px-4 py-2">{t('reports.perPractitioner.colInapt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {perPractitioner.map((p) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">{p.total}</td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{p.apt}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-700">{p.apt_conditionat}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700">{p.inapt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {perPractitioner.map((p) => (
              <div key={p.name} className="border rounded-lg p-3 space-y-2">
                <div className="font-medium">{p.name}</div>
                <div className="grid grid-cols-4 gap-x-2 text-xs">
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.perPractitioner.colTotal')}</div>
                    <div className="font-bold text-base">{p.total}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.perPractitioner.colApt')}</div>
                    <div className="font-bold text-base text-emerald-700">{p.apt}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.perPractitioner.colAptConditionat')}</div>
                    <div className="font-bold text-base text-amber-700">{p.apt_conditionat}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.perPractitioner.colInapt')}</div>
                    <div className="font-bold text-base text-red-700">{p.inapt}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Revenue — admin-only */}
      {caps.canWriteAdministrative && invoices.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {t('reports.revenue.title')}
          </h2>
          <div className="text-xs text-muted-foreground mb-2">
            {t('reports.revenue.invoiced')}: <strong>{revenueTotals.invoiced.toFixed(2)} RON</strong>
            {' · '}
            {t('reports.revenue.paid')}: <strong>{revenueTotals.paid.toFixed(2)} RON</strong>
            {' · '}
            {t('reports.revenue.outstanding')}: <strong>{(revenueTotals.invoiced - revenueTotals.paid).toFixed(2)} RON</strong>
          </div>
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('reports.revenue.colCompany')}</th>
                  <th className="text-right px-4 py-2">{t('reports.revenue.colInvoiced')}</th>
                  <th className="text-right px-4 py-2">{t('reports.revenue.colPaid')}</th>
                  <th className="text-right px-4 py-2">{t('reports.revenue.colOutstanding')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {revenueRows.map((r) => (
                  <tr key={r.companyId}>
                    <td className="px-4 py-2">
                      <Link href={`/companies/${r.companyId}`} className="hover:underline font-medium">
                        {r.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {r.invoiced.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-green-700">
                      {r.paid.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {(r.invoiced - r.paid).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {revenueRows.map((r) => (
              <div key={r.companyId} className="border rounded-lg p-3 space-y-2">
                <Link href={`/companies/${r.companyId}`} className="font-medium hover:underline block">
                  {r.companyName}
                </Link>
                <div className="grid grid-cols-3 gap-x-2 text-xs">
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.revenue.colInvoiced')}</div>
                    <div className="font-bold text-sm tabular-nums">{r.invoiced.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.revenue.colPaid')}</div>
                    <div className="font-bold text-sm tabular-nums text-green-700">{r.paid.toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5 text-[10px]">{t('reports.revenue.colOutstanding')}</div>
                    <div className="font-bold text-sm tabular-nums text-muted-foreground">{(r.invoiced - r.paid).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel = null,
  tone = 'default',
  valueColor = 'text-foreground',
}: {
  label: string
  value: number
  sublabel?: string | null
  tone?: 'default' | 'destructive'
  valueColor?: string
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
          tone === 'destructive' && value > 0 ? 'text-destructive' : valueColor
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

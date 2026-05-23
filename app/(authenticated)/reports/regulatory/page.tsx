import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  parseDateRange,
  resolveDateRange,
} from '@/lib/reports/date-ranges'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'
import { PrintButton } from '@/app/(authenticated)/companies/[id]/report/print-button'

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function RegulatoryPage({ searchParams }: PageProps) {
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

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [examinations, invoices, workplaces, overdueCount, totalMonitored] =
    await Promise.all([
      prisma.examination.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
        },
        select: {
          id: true,
          verdict: true,
          signedAt: true,
          status: true,
        },
      }),

      prisma.invoice.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: { notIn: ['draft', 'cancelled'] },
          issuedAt: { gte: range.from, lt: range.to },
        },
        select: { id: true, status: true, total: true },
      }),

      prisma.workplace.findMany({
        where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
        select: {
          id: true,
          riskProfile: true,
          employeeAssignments: {
            where: { isCurrent: true, employee: { deletedAt: null } },
            select: { employeeId: true },
          },
        },
      }),

      prisma.examination.count({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          status: { notIn: ['cancelled', 'no_show', 'completed'] },
          nextExaminationDueDate: { not: null, lt: today },
        },
      }),

      prisma.employeeWorkplaceAssignment.count({
        where: {
          tenantId: user.tenantId,
          isCurrent: true,
          employee: { deletedAt: null },
          workplace: { deletedAt: null },
        },
      }),
    ])

  // Examination stats
  const notCancelled = examinations.filter(
    (e) => e.status !== 'cancelled' && e.status !== 'no_show'
  )
  const stats = {
    total: notCancelled.length,
    signed: notCancelled.filter((e) => e.signedAt !== null).length,
    apt: notCancelled.filter((e) => e.verdict === 'apt').length,
    apt_conditionat: notCancelled.filter((e) => e.verdict === 'apt_conditionat').length,
    inapt_temporar: notCancelled.filter((e) => e.verdict === 'inapt_temporar').length,
    inapt: notCancelled.filter((e) => e.verdict === 'inapt').length,
  }

  // Revenue stats
  const revenue = {
    invoiced: invoices.reduce((s, i) => s + Number(i.total), 0),
    paid: invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + Number(i.total), 0),
  }

  // Hazard stats
  const exposedWorkerIds = new Set<string>()
  let hazardWorkplaceCount = 0
  for (const wp of workplaces) {
    const rp = parseRiskProfile(wp.riskProfile)
    let hasAny = false
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (entry?.present) {
          hasAny = true
          for (const a of wp.employeeAssignments) exposedWorkerIds.add(a.employeeId)
        }
      }
    }
    if (hasAny) hazardWorkplaceCount++
  }

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'long' }
  )
  const printedAt = dateFormatter.format(new Date())
  const fromLabel = dateFormatter.format(range.from)
  const toLabel = dateFormatter.format(new Date(range.to.getTime() - 86_400_000))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('reports.regulatory.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('reports.regulatory.subtitle')}</p>
          <p className="text-xs text-muted-foreground mt-1 print:block hidden">
            {fromLabel} — {toLabel} · {t('reports.regulatory.print')}: {printedAt}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <PrintButton label={t('reports.regulatory.print')} />
        </div>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2 text-sm print:hidden">
        <span className="text-muted-foreground self-center mr-1">{t('reports.range.label')}:</span>
        {ALL_DATE_RANGES.map((key) => (
          <Link
            key={key}
            href={`/reports/regulatory?range=${key}`}
            className={`px-3 py-1 rounded-md border transition-colors ${
              rangeKey === key ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {t(`reports.range.${key}`)}
          </Link>
        ))}
      </div>

      <div className="print:hidden text-sm text-muted-foreground border-b pb-2">
        {fromLabel} — {toLabel}
      </div>

      {/* Workers section */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('reports.regulatory.sectionWorkers')}</h2>
        <div className="border rounded-lg divide-y text-sm">
          <Row label={t('reports.regulatory.totalMonitored')} value={totalMonitored} />
        </div>
      </section>

      {/* Examinations section */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('reports.regulatory.sectionExams')}</h2>
        <div className="border rounded-lg divide-y text-sm">
          <Row label={t('reports.regulatory.totalExamined')} value={stats.total} bold valueColor="text-foreground" />
          <Row label={t('reports.regulatory.totalSigned')} value={stats.signed} valueColor="text-foreground" />
          <Row label={t('reports.regulatory.apt')} value={stats.apt} valueColor="text-emerald-700" />
          <Row label={t('reports.regulatory.aptConditionat')} value={stats.apt_conditionat} valueColor="text-amber-700" />
          <Row label={t('reports.regulatory.inaptTemporar')} value={stats.inapt_temporar} valueColor="text-orange-700" />
          <Row label={t('reports.regulatory.inapt')} value={stats.inapt} valueColor="text-red-700" />
          <Row
            label={t('reports.regulatory.overdueCount')}
            value={overdueCount}
            tone={overdueCount > 0 ? 'destructive' : 'default'}
          />
        </div>
      </section>

      {/* Hazards section */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('reports.regulatory.sectionHazards')}</h2>
        <div className="border rounded-lg divide-y text-sm">
          <Row label={t('reports.regulatory.hazardWorkplaces')} value={hazardWorkplaceCount} />
          <Row label={t('reports.regulatory.hazardExposed')} value={exposedWorkerIds.size} />
        </div>
      </section>

      {/* Revenue section */}
      {caps.canWriteAdministrative && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('reports.regulatory.sectionRevenue')}</h2>
          <div className="border rounded-lg divide-y text-sm">
            <Row
              label={t('reports.regulatory.invoiced')}
              value={`${revenue.invoiced.toFixed(2)} RON`}
            />
            <Row
              label={t('reports.regulatory.paid')}
              value={`${revenue.paid.toFixed(2)} RON`}
            />
          </div>
        </section>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  bold = false,
  tone = 'default',
  valueColor,
}: {
  label: string
  value: string | number
  bold?: boolean
  tone?: 'default' | 'destructive'
  valueColor?: string
}) {
  return (
    <div className="flex justify-between items-center px-4 py-3 gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums font-medium ${bold ? 'font-semibold text-base' : ''} ${
          tone === 'destructive' && Number(value) > 0
            ? 'text-destructive'
            : valueColor ?? ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}

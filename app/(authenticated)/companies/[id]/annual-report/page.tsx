import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'
import { ProseEditor } from './prose-editor'
import { PrintButton } from '../report/print-button'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string }>
}

export default async function AnnualReportPage({ params, searchParams }: PageProps) {
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

  const { id } = await params
  const sp = await searchParams
  const currentYear = new Date().getFullYear()
  const year = Number(sp.year ?? currentYear)

  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true, registrationNumber: true },
  })
  if (!company) notFound()

  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year + 1, 0, 1))

  const [examinations, workplaces] = await Promise.all([
    prisma.examination.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        createdAt: { gte: from, lt: to },
        workplace: { companyId: company.id, deletedAt: null },
        status: { notIn: ['cancelled', 'no_show'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        examinationNumber: true,
        createdAt: true,
        signedAt: true,
        verdict: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        workplace: { select: { id: true, name: true } },
        examinationType: { select: { nameRo: true, nameEn: true } },
      },
    }),

    prisma.workplace.findMany({
      where: {
        companyId: company.id,
        tenantId: user.tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, riskProfile: true },
    }),
  ])

  const uniqueWorkers = new Set(examinations.map((e) => e.employee.id))

  const stats = {
    total: examinations.length,
    signed: examinations.filter((e) => e.signedAt !== null).length,
    apt: examinations.filter((e) => e.verdict === 'apt').length,
    apt_conditionat: examinations.filter((e) => e.verdict === 'apt_conditionat').length,
    inapt_temporar: examinations.filter((e) => e.verdict === 'inapt_temporar').length,
    inapt: examinations.filter((e) => e.verdict === 'inapt').length,
    workers: uniqueWorkers.size,
    workplaces: workplaces.length,
  }

  // Build top hazard list from workplace profiles
  const hazardWorkerMap = new Map<string, Set<string>>()
  for (const wp of workplaces) {
    const rp = parseRiskProfile(wp.riskProfile)
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (!entry?.present) continue
        const key = `${category}:${hazardKey}`
        if (!hazardWorkerMap.has(key)) hazardWorkerMap.set(key, new Set())
      }
    }
  }
  const topHazardKeys = Array.from(hazardWorkerMap.keys()).slice(0, 5)
  const topHazardLabels = topHazardKeys.map((k) => {
    const hazardKey = k.split(':')[1]
    return t(`workplaces.form.hazardName.${hazardKey}`)
  })

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const availableYears = Array.from(
    { length: Math.min(5, currentYear - 2024) },
    (_, i) => currentYear - i
  )

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/companies/${company.id}`}
            className="text-sm text-muted-foreground hover:text-foreground print:hidden"
          >
            ← {company.name}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mt-2">
            {t('annualReport.title')}
          </h1>
          <h2 className="text-xl font-semibold mt-0.5">{company.name}</h2>
          <div className="text-sm text-muted-foreground mt-1 space-x-3">
            {company.cui && <span>CUI: {company.cui}</span>}
            {company.registrationNumber && (
              <span>Reg: {company.registrationNumber}</span>
            )}
            <span>{year}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <PrintButton label={t('annualReport.print')} />
        </div>
      </div>

      {/* Year selector */}
      {availableYears.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm print:hidden">
          <span className="text-muted-foreground self-center mr-1">
            {t('annualReport.yearLabel')}:
          </span>
          {availableYears.map((y) => (
            <Link
              key={y}
              href={`/companies/${company.id}/annual-report?year=${y}`}
              className={`px-3 py-1 rounded-md border transition-colors ${
                year === y ? 'bg-secondary font-medium' : 'hover:bg-muted'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      {/* Stats */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('annualReport.sectionStats')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t('annualReport.statTotalExams')} value={stats.total} />
          <StatCard
            label={t('annualReport.statSigned')}
            value={stats.signed}
            sublabel={stats.total > 0 ? `${Math.round((stats.signed / stats.total) * 100)}%` : null}
          />
          <StatCard label={t('annualReport.statWorkers')} value={stats.workers} />
          <StatCard label={t('annualReport.statWorkplaces')} value={stats.workplaces} />
          <StatCard label={t('annualReport.statApt')} value={stats.apt} />
          <StatCard label={t('annualReport.statAptConditionat')} value={stats.apt_conditionat} />
          <StatCard label={t('annualReport.statInaptTemporar')} value={stats.inapt_temporar} />
          <StatCard label={t('annualReport.statInapt')} value={stats.inapt} />
        </div>
      </section>

      {/* AI prose section */}
      <ProseEditor
        payload={{
          companyName: company.name,
          year,
          totalExams: stats.total,
          signed: stats.signed,
          apt: stats.apt,
          apt_conditionat: stats.apt_conditionat,
          inapt_temporar: stats.inapt_temporar,
          inapt: stats.inapt,
          workers: stats.workers,
          workplaces: stats.workplaces,
          topHazards: topHazardLabels,
          locale,
        }}
        labels={{
          generate: t('annualReport.generateProse'),
          generating: t('annualReport.generating'),
          editHint: t('annualReport.proseEditHint'),
          apiKeyMissing: t('annualReport.proseApiKeyMissing'),
          error: t('annualReport.proseError'),
          sectionTitle: t('annualReport.sectionProse'),
        }}
      />

      {/* Examination list */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('annualReport.examsTableTitle')}</h2>
        {examinations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">—</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('annualReport.colNumber')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colDate')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colWorker')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colWorkplace')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colType')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colVerdict')}</th>
                  <th className="text-left px-4 py-2">{t('annualReport.colSigned')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {examinations.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      <Link
                        href={`/examinations/${e.id}`}
                        className="hover:underline print:no-underline"
                      >
                        {e.examinationNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {dateFormatter.format(e.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium whitespace-nowrap">
                      {e.employee.lastName} {e.employee.firstName}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.workplace.name}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {locale === 'en' && e.examinationType.nameEn
                        ? e.examinationType.nameEn
                        : e.examinationType.nameRo}
                    </td>
                    <td className="px-4 py-2">
                      {e.verdict
                        ? t(`examinations.form.verdict.${e.verdict}`)
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {e.signedAt ? '✓' : '—'}
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
}: {
  label: string
  value: number
  sublabel?: string | null
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
      )}
    </div>
  )
}

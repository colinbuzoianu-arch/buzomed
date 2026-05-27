import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator, type Locale } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  parseDateRange,
  resolveDateRange,
} from '@/lib/reports/date-ranges'
import './report.css'
import { PrintButton } from './print-button'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { formatDate } from '@/lib/format-date'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string; view?: string }>
}

export default async function CompanyReportPage({
  params,
  searchParams,
}: PageProps) {
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
  const rangeKey = parseDateRange(sp.range)
  const range = resolveDateRange(rangeKey)
  const view = sp.view === 'examinations' ? 'examinations' : 'workers'

  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true, registrationNumber: true },
  })
  if (!company) notFound()

  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      createdAt: { gte: range.from, lt: range.to },
      workplace: { companyId: company.id, deletedAt: null },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      examinationNumber: true,
      createdAt: true,
      completedAt: true,
      signedAt: true,
      status: true,
      verdict: true,
      nextExaminationDueDate: true,
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      workplace: {
        select: { id: true, name: true, department: true },
      },
      examinationType: {
        select: { nameRo: true, nameEn: true },
      },
      practitioner: {
        select: { firstName: true, lastName: true },
      },
    },
  })

  // Worker summary: one row per worker with their most recent exam.
  const byWorker = new Map<string, (typeof examinations)[number]>()
  for (const e of examinations) {
    const existing = byWorker.get(e.employee.id)
    if (!existing || e.createdAt > existing.createdAt) {
      byWorker.set(e.employee.id, e)
    }
  }
  const workers = Array.from(byWorker.values()).sort((a, b) =>
    `${a.employee.lastName}${a.employee.firstName}`.localeCompare(
      `${b.employee.lastName}${b.employee.firstName}`,
      'ro'
    )
  )

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const fromDateStr = range.from.toISOString().slice(0, 10)
  const toDateStr = new Date(range.to.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10)
  const exportUrl = `/api/examinations/export?companyId=${company.id}&from=${fromDateStr}&to=${toDateStr}`

  return (
    <div className="space-y-6">
      <div className="report-header">
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: company.name, href: `/companies/${company.id}` }, { label: t('companyReport.title') }]} className="print:hidden" />
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-bold">
              {t('companyReport.title')}
            </h1>
            <h2 className="text-xl font-semibold mt-1">{company.name}</h2>
            <div className="text-sm text-muted-foreground mt-1 space-x-4">
              {company.cui && <span>CUI: {company.cui}</span>}
              {company.registrationNumber && (
                <span>Reg: {company.registrationNumber}</span>
              )}
            </div>
            <div className="text-sm mt-2">
              {t('companyReport.dateRange')}: {formatDate(range.from, 'medium', locale === 'ro' ? 'ro' : 'en')} —{' '}
              {formatDate(new Date(range.to.getTime() - 86_400_000), 'medium', locale === 'ro' ? 'ro' : 'en')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <a
              href={exportUrl}
              download
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
            >
              ↓ {t('companyReport.exportCsv')}
            </a>
            <a
              href={`/api/reports/company/${company.id}/employees-export`}
              download
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
            >
              ↓ {t('companyReport.exportEmployeesCsv')}
            </a>
            <a
              href={`/api/reports/company/${company.id}/vaccinations-export`}
              download
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
            >
              ↓ {t('companyReport.exportVaccinationsCsv')}
            </a>
            <a
              href={`/api/reports/company/${company.id}/pdf?from=${fromDateStr}&to=${toDateStr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted"
            >
              PDF {t('companyReport.exportPdf')}
            </a>
            <PrintButton label={t('companyReport.print')} />
          </div>
        </div>
      </div>

      {/* Range + view selectors */}
      <div className="flex flex-wrap gap-2 text-sm print:hidden">
        <span className="text-muted-foreground self-center mr-2">
          {t('reports.range.label')}:
        </span>
        {ALL_DATE_RANGES.map((key) => (
          <Link
            key={key}
            href={`/companies/${company.id}/report?range=${key}&view=${view}`}
            className={`px-3 py-1 rounded-md border ${
              rangeKey === key ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {t(`reports.range.${key}`)}
          </Link>
        ))}
      </div>

      <div className="flex gap-2 text-sm print:hidden">
        <Link
          href={`/companies/${company.id}/report?range=${rangeKey}&view=workers`}
          className={`px-3 py-1 rounded-md border ${
            view === 'workers' ? 'bg-secondary font-medium' : 'hover:bg-muted'
          }`}
        >
          {t('companyReport.tabWorkers')} ({workers.length})
        </Link>
        <Link
          href={`/companies/${company.id}/report?range=${rangeKey}&view=examinations`}
          className={`px-3 py-1 rounded-md border ${
            view === 'examinations'
              ? 'bg-secondary font-medium'
              : 'hover:bg-muted'
          }`}
        >
          {t('companyReport.tabExaminations')} ({examinations.length})
        </Link>
      </div>

      {examinations.length === 0 ? (
        <EmptyState
          illustration="reports"
          title={t('companyReport.emptyTitle')}
          description={t('companyReport.emptyDescription')}
        />
      ) : view === 'workers' ? (
        <WorkersTable
          workers={workers}
          locale={locale}
          today={today}
          t={t}
        />
      ) : (
        <ExaminationsTable
          examinations={examinations}
          locale={locale}
          t={t}
        />
      )}
    </div>
  )
}

function WorkersTable(props: {
  workers: Array<{
    id: string
    examinationNumber: string
    createdAt: Date
    signedAt: Date | null
    verdict: string | null
    nextExaminationDueDate: Date | null
    employee: { id: string; firstName: string; lastName: string }
    workplace: { name: string; department: string | null }
  }>
  locale: Locale
  today: Date
  t: (k: string) => string
}) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2">{props.t('companyReport.colWorker')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colWorkplace')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colLastExam')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colVerdict')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colNextDue')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colStatus')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {props.workers.map((w) => {
            const isOverdue =
              w.nextExaminationDueDate && w.nextExaminationDueDate < props.today
            return (
              <tr key={w.employee.id}>
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  {w.employee.lastName} {w.employee.firstName}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {w.workplace.name}
                  {w.workplace.department && (
                    <span className="text-xs"> — {w.workplace.department}</span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {formatDate(w.createdAt, 'medium', props.locale === 'ro' ? 'ro' : 'en')}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({w.examinationNumber})
                  </span>
                </td>
                <td className="px-4 py-2">
                  {w.verdict ? <VerdictBadge verdict={w.verdict} /> : '—'}
                </td>
                <td
                  className={`px-4 py-2 whitespace-nowrap ${
                    isOverdue ? 'text-destructive font-medium' : ''
                  }`}
                >
                  {w.nextExaminationDueDate
                    ? formatDate(w.nextExaminationDueDate, 'medium', props.locale === 'ro' ? 'ro' : 'en')
                    : '—'}
                </td>
                <td className="px-4 py-2 text-xs">
                  {w.signedAt
                    ? props.t('companyReport.statusSigned')
                    : props.t('companyReport.statusUnsigned')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ExaminationsTable(props: {
  examinations: Array<{
    id: string
    examinationNumber: string
    createdAt: Date
    completedAt: Date | null
    signedAt: Date | null
    status: string
    verdict: string | null
    employee: { firstName: string; lastName: string }
    workplace: { name: string }
    examinationType: { nameRo: string; nameEn: string | null }
    practitioner: { firstName: string; lastName: string } | null
  }>
  locale: Locale
  t: (k: string) => string
}) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2">{props.t('companyReport.colNumber')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colDate')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colWorker')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colWorkplace')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colExamType')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colVerdict')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colPractitioner')}</th>
            <th className="text-left px-4 py-2">{props.t('companyReport.colStatus')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {props.examinations.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                {e.examinationNumber}
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                {formatDate(e.createdAt, 'medium', props.locale === 'ro' ? 'ro' : 'en')}
              </td>
              <td className="px-4 py-2 font-medium whitespace-nowrap">
                {e.employee.lastName} {e.employee.firstName}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {e.workplace.name}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {props.locale === 'en' && e.examinationType.nameEn
                  ? e.examinationType.nameEn
                  : e.examinationType.nameRo}
              </td>
              <td className="px-4 py-2">
                {e.verdict ? <VerdictBadge verdict={e.verdict} /> : '—'}
              </td>
              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                {e.practitioner
                  ? `${e.practitioner.lastName} ${e.practitioner.firstName}`
                  : '—'}
              </td>
              <td className="px-4 py-2 text-xs">
                {e.signedAt
                  ? props.t('companyReport.statusSigned')
                  : props.t('companyReport.statusUnsigned')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


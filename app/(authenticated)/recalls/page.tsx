import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator, type Locale } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import type { RecallStatus } from '@prisma/client'
import { RecallActions } from './recall-actions'

interface PageProps {
  searchParams: Promise<{ horizon?: string; companyId?: string }>
}

const VALID_HORIZONS = [
  'overdue',
  'thisWeek',
  'thisMonth',
  'next3Months',
  'all',
] as const
type Horizon = (typeof VALID_HORIZONS)[number]

function getHorizonRange(horizon: Horizon): {
  from: Date | null
  to: Date | null
} {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  switch (horizon) {
    case 'overdue':
      return { from: null, to: today }
    case 'thisWeek': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 7)
      return { from: today, to: end }
    }
    case 'thisMonth': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 30)
      return { from: today, to: end }
    }
    case 'next3Months': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 90)
      return { from: today, to: end }
    }
    case 'all':
      return { from: null, to: null }
  }
}

export default async function RecallsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const params = await searchParams
  const horizon: Horizon =
    params.horizon && VALID_HORIZONS.includes(params.horizon as Horizon)
      ? (params.horizon as Horizon)
      : 'thisMonth'
  const companyIdFilter = params.companyId || null

  // Lazy promotion of pending → overdue. Same as the API does.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.recall.updateMany({
    where: {
      tenantId: user.tenantId,
      status: 'pending',
      dueDate: { lt: today },
      deletedAt: null,
    },
    data: { status: 'overdue' },
  })

  const range = getHorizonRange(horizon)

  // Status filter — overdue tab only shows overdue, others show
  // pending + overdue (overdue items always sort first).
  const statusFilter =
    horizon === 'overdue'
      ? { status: 'overdue' as const }
      : { status: { in: ['pending', 'overdue'] as RecallStatus[] } }

  const [recalls, overdueCount, allHorizonCounts, companies] = await Promise.all([
    prisma.recall.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...statusFilter,
        ...(range.from ? { dueDate: { gte: range.from } } : {}),
        ...(range.to
          ? horizon === 'overdue'
            ? { dueDate: { lt: range.to } }
            : { dueDate: { lte: range.to } }
          : {}),
        ...(companyIdFilter
          ? { workplace: { companyId: companyIdFilter, deletedAt: null } }
          : {}),
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 500,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            archivedAt: true,
          },
        },
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            company: { select: { id: true, name: true } },
          },
        },
        examinationType: {
          select: { nameRo: true, nameEn: true },
        },
      },
    }),
    prisma.recall.count({
      where: {
        tenantId: user.tenantId,
        status: 'overdue',
        deletedAt: null,
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
      },
    }),
    // Counts per horizon for the tab indicators — one query per horizon.
    Promise.all(
      VALID_HORIZONS.map(async (h) => {
        const r = getHorizonRange(h)
        const count = await prisma.recall.count({
          where: {
            tenantId: user.tenantId!,
            deletedAt: null,
            ...(h === 'overdue'
              ? { status: 'overdue' }
              : { status: { in: ['pending', 'overdue'] as RecallStatus[] } }),
            ...(r.from ? { dueDate: { gte: r.from } } : {}),
            ...(r.to
              ? h === 'overdue'
                ? { dueDate: { lt: r.to } }
                : { dueDate: { lte: r.to } }
              : {}),
            OR: [
              { createdFromExaminationId: null },
              { createdFromExamination: { deletedAt: null } },
            ],
          },
        })
        return [h, count] as const
      })
    ),
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  // Defensive: archived employees shouldn't show even though the
  // assignment-end logic auto-ends their assignments. Belt + braces.
  const visibleRecalls = recalls.filter((r) => r.employee.archivedAt === null)

  const countsMap = Object.fromEntries(allHorizonCounts)

  // Practitioners for the schedule dialog dropdown
  const practitioners = await prisma.user.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      deletedAt: null,
      roles: { hasSome: ['practitioner', 'practice_admin'] },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      professionalTitle: true,
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('recalls.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('recalls.subtitle')}
        </p>
      </div>

      {/* Horizon filter tabs */}
      <div className="flex gap-2 text-sm flex-wrap">
        {(
          [
            { h: 'overdue' as const, label: t('recalls.tabs.overdue'), tone: 'destructive' },
            { h: 'thisWeek' as const, label: t('recalls.tabs.thisWeek') },
            { h: 'thisMonth' as const, label: t('recalls.tabs.thisMonth') },
            { h: 'next3Months' as const, label: t('recalls.tabs.next3Months') },
            { h: 'all' as const, label: t('recalls.tabs.all') },
          ]
        ).map((tab) => {
          const active = horizon === tab.h
          const count = countsMap[tab.h] ?? 0
          const href =
            companyIdFilter
              ? `/recalls?horizon=${tab.h}&companyId=${companyIdFilter}`
              : `/recalls?horizon=${tab.h}`
          return (
            <Link
              key={tab.h}
              href={href}
              className={`px-3 py-1 rounded-md border ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              } ${tab.tone === 'destructive' && count > 0 ? 'border-destructive text-destructive' : ''}`}
            >
              {tab.label}{' '}
              <span
                className={
                  tab.tone === 'destructive' && count > 0
                    ? 'font-semibold'
                    : 'text-muted-foreground'
                }
              >
                ({count})
              </span>
            </Link>
          )
        })}
      </div>

      {/* Company filter */}
      {companies.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('recalls.filterCompany')}:
          </span>
          <Link
            href={`/recalls?horizon=${horizon}`}
            className={`px-2 py-0.5 rounded border ${
              !companyIdFilter ? 'bg-secondary' : 'hover:bg-muted'
            }`}
          >
            {t('recalls.allCompanies')}
          </Link>
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/recalls?horizon=${horizon}&companyId=${c.id}`}
              className={`px-2 py-0.5 rounded border ${
                companyIdFilter === c.id ? 'bg-secondary' : 'hover:bg-muted'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {visibleRecalls.length === 0 ? (
        <RecallsEmptyState
          horizon={horizon}
          overdueCount={overdueCount}
          t={t}
        />
      ) : (
        <RecallsTable
          recalls={visibleRecalls.map((r) => ({
            id: r.id,
            status: r.status,
            dueDate: r.dueDate.toISOString(),
            employee: r.employee,
            workplaceName: r.workplace.name,
            workplaceDepartment: r.workplace.department,
            companyName: r.workplace.company.name,
            companyId: r.workplace.company.id,
            examinationTypeName:
              locale === 'en'
                ? r.examinationType.nameEn ?? r.examinationType.nameRo
                : r.examinationType.nameRo,
          }))}
          locale={locale}
          canWrite={caps.canWrite}
          today={today}
          practitioners={practitioners.map((p) => ({
            id: p.id,
            label: `${p.lastName} ${p.firstName}${
              p.professionalTitle ? ` (${p.professionalTitle})` : ''
            }`,
          }))}
          defaultPractitionerId={
            user.roles.includes('practitioner') ? user.id : undefined
          }
          labels={{
            colWorker: t('recalls.colWorker'),
            colCompany: t('recalls.colCompany'),
            colWorkplace: t('recalls.colWorkplace'),
            colExamType: t('recalls.colExamType'),
            colDueDate: t('recalls.colDueDate'),
            colDaysUntil: t('recalls.colDaysUntil'),
            colActions: t('recalls.colActions'),
            statusOverdue: t('recalls.statusOverdue'),
            daysOverdue: t('recalls.daysOverdue'),
            daysUntilDue: t('recalls.daysUntilDue'),
            dueToday: t('recalls.dueToday'),
            scheduleButton: t('recalls.scheduleButton'),
            cancelButton: t('recalls.cancelButton'),
            scheduling: t('recalls.scheduling'),
            cancelling: t('recalls.cancelling'),
            scheduleDialogTitle: t('recalls.scheduleDialogTitle'),
            schedulePractitioner: t('recalls.schedulePractitioner'),
            scheduleAt: t('recalls.scheduleAt'),
            scheduleAtHelp: t('recalls.scheduleAtHelp'),
            submitSchedule: t('recalls.submitSchedule'),
            cancelDialogTitle: t('recalls.cancelDialogTitle'),
            cancelReasonLabel: t('recalls.cancelReasonLabel'),
            cancelReasonPlaceholder: t('recalls.cancelReasonPlaceholder'),
            submitCancel: t('recalls.submitCancel'),
            cancelDialog: t('common.cancel'),
            errorMessage: t('recalls.errorMessage'),
          }}
        />
      )}
    </div>
  )
}

function RecallsEmptyState({
  horizon,
  overdueCount,
  t,
}: {
  horizon: Horizon
  overdueCount: number
  t: (k: string) => string
}) {
  return (
    <div className="border border-dashed rounded-lg p-12 text-center space-y-2">
      <p className="text-sm text-muted-foreground">
        {horizon === 'overdue'
          ? t('recalls.emptyOverdue')
          : t('recalls.empty')}
      </p>
      {horizon !== 'overdue' && overdueCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('recalls.emptyButOverdueHint').replace(
            '{count}',
            String(overdueCount)
          )}{' '}
          <Link href="/recalls?horizon=overdue" className="underline">
            {t('recalls.viewOverdue')}
          </Link>
        </p>
      )}
    </div>
  )
}

function RecallsTable(props: {
  recalls: Array<{
    id: string
    status: string
    dueDate: string
    employee: { id: string; firstName: string; lastName: string }
    workplaceName: string
    workplaceDepartment: string | null
    companyName: string
    companyId: string
    examinationTypeName: string
  }>
  locale: Locale
  canWrite: boolean
  today: Date
  practitioners: Array<{ id: string; label: string }>
  defaultPractitionerId?: string
  labels: Record<string, string>
}) {
  const dateFormatter = new Intl.DateTimeFormat(
    props.locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2">{props.labels.colWorker}</th>
            <th className="text-left px-4 py-2">{props.labels.colCompany}</th>
            <th className="text-left px-4 py-2">
              {props.labels.colWorkplace}
            </th>
            <th className="text-left px-4 py-2">{props.labels.colExamType}</th>
            <th className="text-left px-4 py-2">{props.labels.colDueDate}</th>
            <th className="text-left px-4 py-2 whitespace-nowrap">
              {props.labels.colDaysUntil}
            </th>
            {props.canWrite && (
              <th className="text-right px-4 py-2">
                {props.labels.colActions}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {props.recalls.map((r) => {
            const due = new Date(r.dueDate)
            const days = Math.round(
              (due.getTime() - props.today.getTime()) / (1000 * 60 * 60 * 24)
            )
            const isOverdue = r.status === 'overdue'
            return (
              <tr
                key={r.id}
                className={isOverdue ? 'bg-destructive/5' : undefined}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="hover:underline font-medium"
                  >
                    {r.employee.lastName} {r.employee.firstName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/companies/${r.companyId}`}
                    className="hover:underline"
                  >
                    {r.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.workplaceName}
                  {r.workplaceDepartment && (
                    <span className="text-xs"> — {r.workplaceDepartment}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.examinationTypeName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {dateFormatter.format(due)}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap ${
                    isOverdue ? 'text-destructive font-medium' : ''
                  }`}
                >
                  {days === 0
                    ? props.labels.dueToday
                    : days < 0
                      ? props.labels.daysOverdue.replace(
                          '{days}',
                          String(-days)
                        )
                      : props.labels.daysUntilDue.replace(
                          '{days}',
                          String(days)
                        )}
                </td>
                {props.canWrite && (
                  <td className="px-4 py-3 text-right">
                    <RecallActions
                      recallId={r.id}
                      employeeName={`${r.employee.lastName} ${r.employee.firstName}`}
                      practitioners={props.practitioners}
                      defaultPractitionerId={props.defaultPractitionerId}
                      labels={props.labels}
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

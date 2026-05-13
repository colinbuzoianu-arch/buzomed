import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import type { ExaminationStatus, RecallStatus } from '@prisma/client'
import { RecallActions } from '../recalls/recall-actions'

/**
 * Merged examinations page (after session 10 fixup).
 *
 * The page hosts BOTH:
 *   - Examination records (rows in the examinations table) — what the
 *     cabinet has done or is doing
 *   - Recall obligations (rows in the recalls table) — workers due for
 *     their next exam, no record yet
 *
 * They share one page because they're a continuous workflow: a future
 * obligation (Scadențe) becomes a scheduled exam (Programate) becomes
 * an in-progress exam (În curs) becomes a completed exam (Finalizate)
 * which itself triggers a new Scadențe entry ~12 months later.
 *
 * URL shape:
 *   /examinations                       — defaults to tab=scadente
 *   /examinations?tab=scadente          — recall obligations
 *   /examinations?tab=scadente&horizon=thisWeek
 *   /examinations?tab=scadente&horizon=overdue
 *   /examinations?tab=programate        — examinations with status=scheduled
 *   /examinations?tab=in_curs           — examinations with status=in_progress
 *   /examinations?tab=finalizate        — examinations with status=completed
 *   /examinations?tab=toate             — every examination
 *
 * Default tab is `scadente` because that's the actionable view ("who do
 * I call this week"). The previous default of `toate` showed every
 * exam ever, which buried the urgent work.
 */

type Tab = 'scadente' | 'programate' | 'in_curs' | 'finalizate' | 'toate'
type Horizon =
  | 'overdue'
  | 'thisWeek'
  | 'thisMonth'
  | 'next3Months'
  | 'all'

const VALID_TABS: Tab[] = [
  'scadente',
  'programate',
  'in_curs',
  'finalizate',
  'toate',
]

const VALID_HORIZONS: Horizon[] = [
  'overdue',
  'thisWeek',
  'thisMonth',
  'next3Months',
  'all',
]

/** Map our tab labels to the underlying ExaminationStatus filter. */
function tabToStatus(tab: Tab): ExaminationStatus | null {
  switch (tab) {
    case 'programate':
      return 'scheduled'
    case 'in_curs':
      return 'in_progress'
    case 'finalizate':
      return 'completed'
    default:
      return null
  }
}

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

interface PageProps {
  searchParams: Promise<{
    tab?: string
    horizon?: string
    companyId?: string
    // Backwards-compat: old links used ?status=scheduled directly.
    status?: string
  }>
}

export default async function ExaminationsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const params = await searchParams

  // Backwards-compat: bookmarks to /examinations?status=scheduled still work.
  const legacyStatus = params.status
  let tab: Tab = 'scadente'
  if (params.tab && (VALID_TABS as string[]).includes(params.tab)) {
    tab = params.tab as Tab
  } else if (legacyStatus === 'scheduled') {
    tab = 'programate'
  } else if (legacyStatus === 'in_progress') {
    tab = 'in_curs'
  } else if (legacyStatus === 'completed') {
    tab = 'finalizate'
  }

  const horizon: Horizon =
    params.horizon && (VALID_HORIZONS as string[]).includes(params.horizon)
      ? (params.horizon as Horizon)
      : 'thisMonth'
  const companyIdFilter = params.companyId || null

  // Lazy pending → overdue promotion. Same as the original recall page.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  if (tab === 'scadente') {
    await prisma.recall.updateMany({
      where: {
        tenantId: user.tenantId,
        status: 'pending',
        dueDate: { lt: today },
        deletedAt: null,
      },
      data: { status: 'overdue' },
    })
  }

  // Counts per tab — shown as `(N)` badges on tab labels.
  // For tabs that map to ExaminationStatus, count from examinations.
  // For scadente, count from recalls (pending + overdue, with the
  // soft-deleted-source-exam filter).
  const [examCounts, scadenteCount, overdueScadenteCount] = await Promise.all([
    prisma.examination.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId, deletedAt: null },
      _count: true,
    }),
    prisma.recall.count({
      where: {
        tenantId: user.tenantId,
        status: { in: ['pending', 'overdue'] as RecallStatus[] },
        deletedAt: null,
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
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
  ])

  const countByStatus = (s: ExaminationStatus): number =>
    examCounts.find((c) => c.status === s)?._count ?? 0
  const totalExams = examCounts.reduce((s, c) => s + c._count, 0)

  const tabs: Array<{
    key: Tab
    label: string
    count: number
    overdueBadge?: number
  }> = [
    {
      key: 'scadente',
      label: t('examinations.tabs.scadente'),
      count: scadenteCount,
      overdueBadge: overdueScadenteCount,
    },
    {
      key: 'programate',
      label: t('examinations.tabs.scheduled'),
      count: countByStatus('scheduled'),
    },
    {
      key: 'in_curs',
      label: t('examinations.tabs.in_progress'),
      count: countByStatus('in_progress'),
    },
    {
      key: 'finalizate',
      label: t('examinations.tabs.completed'),
      count: countByStatus('completed'),
    },
    { key: 'toate', label: t('examinations.tabs.all'), count: totalExams },
  ]

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  // CSV export URL — when on an exam tab, scope to that status.
  const exportStatus = tabToStatus(tab)
  const exportUrl = exportStatus
    ? `/api/examinations/export?status=${exportStatus}`
    : '/api/examinations/export'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {t('examinations.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('examinations.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'scadente' && (
            <a
              href={exportUrl}
              className="text-sm border rounded-md px-3 py-2 hover:bg-muted"
            >
              {t('examinations.exportCsv')}
            </a>
          )}
          {caps.canWrite && (
            <Button asChild>
              <Link href="/examinations/new">
                + {t('examinations.newButton')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 text-sm flex-wrap">
        {tabs.map((entry) => {
          const active = tab === entry.key
          const href = `/examinations?tab=${entry.key}`
          const isScadenteWithOverdue =
            entry.key === 'scadente' && (entry.overdueBadge ?? 0) > 0
          return (
            <Link
              key={entry.key}
              href={href}
              className={`px-3 py-1 rounded-md border inline-flex items-center gap-1.5 ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              } ${isScadenteWithOverdue ? 'border-destructive' : ''}`}
            >
              <span>{entry.label}</span>
              <span className="text-muted-foreground">({entry.count})</span>
              {isScadenteWithOverdue && (
                <span
                  className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium"
                  title={t('nav.recallsOverdueTooltip').replace(
                    '{count}',
                    String(entry.overdueBadge ?? 0)
                  )}
                >
                  {entry.overdueBadge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {tab === 'scadente' ? (
        <ScadenteView
          tenantId={user.tenantId}
          locale={locale}
          horizon={horizon}
          companyIdFilter={companyIdFilter}
          canWrite={caps.canWrite}
          isPractitioner={user.roles.includes('practitioner')}
          userId={user.id}
          today={today}
          t={t}
        />
      ) : (
        <ExaminationsListView
          tenantId={user.tenantId}
          status={tabToStatus(tab)}
          locale={locale}
          dateFormatter={dateFormatter}
          canWrite={caps.canWrite}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Scadențe view ────────────────────────────────────────────────────

async function ScadenteView(props: {
  tenantId: string
  locale: 'ro' | 'en'
  horizon: Horizon
  companyIdFilter: string | null
  canWrite: boolean
  isPractitioner: boolean
  userId: string
  today: Date
  t: (k: string) => string
}) {
  const range = getHorizonRange(props.horizon)
  const statusFilter =
    props.horizon === 'overdue'
      ? { status: 'overdue' as const }
      : { status: { in: ['pending', 'overdue'] as RecallStatus[] } }

  const [recalls, allHorizonCounts, companies, practitioners] =
    await Promise.all([
      prisma.recall.findMany({
        where: {
          tenantId: props.tenantId,
          deletedAt: null,
          ...statusFilter,
          ...(range.from ? { dueDate: { gte: range.from } } : {}),
          ...(range.to
            ? props.horizon === 'overdue'
              ? { dueDate: { lt: range.to } }
              : { dueDate: { lte: range.to } }
            : {}),
          ...(props.companyIdFilter
            ? {
                workplace: {
                  companyId: props.companyIdFilter,
                  deletedAt: null,
                },
              }
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
          examinationType: { select: { nameRo: true, nameEn: true } },
        },
      }),
      Promise.all(
        VALID_HORIZONS.map(async (h) => {
          const r = getHorizonRange(h)
          const count = await prisma.recall.count({
            where: {
              tenantId: props.tenantId,
              deletedAt: null,
              ...(h === 'overdue'
                ? { status: 'overdue' }
                : {
                    status: { in: ['pending', 'overdue'] as RecallStatus[] },
                  }),
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
        where: { tenantId: props.tenantId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          tenantId: props.tenantId,
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
      }),
    ])

  const visibleRecalls = recalls.filter((r) => r.employee.archivedAt === null)
  const countsMap = Object.fromEntries(allHorizonCounts)

  const dateFormatter = new Intl.DateTimeFormat(
    props.locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const t = props.t
  const horizonTabs: Array<{
    h: Horizon
    label: string
    destructive?: boolean
  }> = [
    {
      h: 'overdue',
      label: t('recalls.tabs.overdue'),
      destructive: true,
    },
    { h: 'thisWeek', label: t('recalls.tabs.thisWeek') },
    { h: 'thisMonth', label: t('recalls.tabs.thisMonth') },
    { h: 'next3Months', label: t('recalls.tabs.next3Months') },
    { h: 'all', label: t('recalls.tabs.all') },
  ]

  return (
    <div className="space-y-4">
      {/* Horizon sub-tabs */}
      <div className="flex gap-2 text-sm flex-wrap">
        {horizonTabs.map((sub) => {
          const active = props.horizon === sub.h
          const count = countsMap[sub.h] ?? 0
          const href = props.companyIdFilter
            ? `/examinations?tab=scadente&horizon=${sub.h}&companyId=${props.companyIdFilter}`
            : `/examinations?tab=scadente&horizon=${sub.h}`
          return (
            <Link
              key={sub.h}
              href={href}
              className={`px-3 py-1 rounded-md border ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              } ${sub.destructive && count > 0 ? 'border-destructive text-destructive' : ''}`}
            >
              {sub.label}{' '}
              <span
                className={
                  sub.destructive && count > 0
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
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">
            {t('recalls.filterCompany')}:
          </span>
          <Link
            href={`/examinations?tab=scadente&horizon=${props.horizon}`}
            className={`px-2 py-0.5 rounded border ${
              !props.companyIdFilter ? 'bg-secondary' : 'hover:bg-muted'
            }`}
          >
            {t('recalls.allCompanies')}
          </Link>
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/examinations?tab=scadente&horizon=${props.horizon}&companyId=${c.id}`}
              className={`px-2 py-0.5 rounded border ${
                props.companyIdFilter === c.id
                  ? 'bg-secondary'
                  : 'hover:bg-muted'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {visibleRecalls.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {props.horizon === 'overdue'
              ? t('recalls.emptyOverdue')
              : t('recalls.empty')}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">{t('recalls.colWorker')}</th>
                <th className="text-left px-4 py-2">{t('recalls.colCompany')}</th>
                <th className="text-left px-4 py-2">{t('recalls.colWorkplace')}</th>
                <th className="text-left px-4 py-2">{t('recalls.colExamType')}</th>
                <th className="text-left px-4 py-2">{t('recalls.colDueDate')}</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">
                  {t('recalls.colDaysUntil')}
                </th>
                {props.canWrite && (
                  <th className="text-right px-4 py-2">
                    {t('recalls.colActions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRecalls.map((r) => {
                const due = new Date(r.dueDate)
                const days = Math.round(
                  (due.getTime() - props.today.getTime()) /
                    (1000 * 60 * 60 * 24)
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
                        href={`/companies/${r.workplace.company.id}`}
                        className="hover:underline"
                      >
                        {r.workplace.company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.workplace.name}
                      {r.workplace.department && (
                        <span className="text-xs">
                          {' '}— {r.workplace.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {props.locale === 'en'
                        ? r.examinationType.nameEn ?? r.examinationType.nameRo
                        : r.examinationType.nameRo}
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
                        ? t('recalls.dueToday')
                        : days < 0
                          ? t('recalls.daysOverdue').replace(
                              '{days}',
                              String(-days)
                            )
                          : t('recalls.daysUntilDue').replace(
                              '{days}',
                              String(days)
                            )}
                    </td>
                    {props.canWrite && (
                      <td className="px-4 py-3 text-right">
                        <RecallActions
                          recallId={r.id}
                          employeeName={`${r.employee.lastName} ${r.employee.firstName}`}
                          practitioners={practitioners.map((p) => ({
                            id: p.id,
                            label: `${p.lastName} ${p.firstName}${
                              p.professionalTitle
                                ? ` (${p.professionalTitle})`
                                : ''
                            }`,
                          }))}
                          defaultPractitionerId={
                            props.isPractitioner ? props.userId : undefined
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
                            scheduleDialogTitle: t(
                              'recalls.scheduleDialogTitle'
                            ),
                            schedulePractitioner: t(
                              'recalls.schedulePractitioner'
                            ),
                            scheduleAt: t('recalls.scheduleAt'),
                            scheduleAtHelp: t('recalls.scheduleAtHelp'),
                            submitSchedule: t('recalls.submitSchedule'),
                            cancelDialogTitle: t('recalls.cancelDialogTitle'),
                            cancelReasonLabel: t('recalls.cancelReasonLabel'),
                            cancelReasonPlaceholder: t(
                              'recalls.cancelReasonPlaceholder'
                            ),
                            submitCancel: t('recalls.submitCancel'),
                            cancelDialog: t('common.cancel'),
                            errorMessage: t('recalls.errorMessage'),
                          }}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Examinations list view (existing behavior) ───────────────────────

async function ExaminationsListView(props: {
  tenantId: string
  status: ExaminationStatus | null
  locale: 'ro' | 'en'
  dateFormatter: Intl.DateTimeFormat
  canWrite: boolean
  t: (k: string) => string
}) {
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: props.tenantId,
      deletedAt: null,
      ...(props.status ? { status: props.status } : {}),
    },
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      workplace: {
        select: {
          id: true,
          name: true,
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: { select: { nameRo: true, nameEn: true, code: true } },
    },
  })

  const t = props.t

  if (examinations.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-12 text-center">
        <p className="text-sm text-muted-foreground">
          {t('examinations.empty')}
        </p>
        {props.canWrite && (
          <Button asChild className="mt-4">
            <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="border rounded-lg divide-y">
      {examinations.map((e) => (
        <Link
          key={e.id}
          href={`/examinations/${e.id}`}
          className="block px-4 py-3 hover:bg-muted transition-colors"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {e.examinationNumber}
                </span>
                <span>
                  {e.employee.lastName} {e.employee.firstName}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {e.workplace.company.name} • {e.workplace.name} •{' '}
                {props.locale === 'en'
                  ? e.examinationType.nameEn ?? e.examinationType.nameRo
                  : e.examinationType.nameRo}
              </div>
            </div>
            <div className="text-xs text-right">
              <StatusBadge status={e.status} t={t} />
              {e.scheduledAt && (
                <div className="text-muted-foreground mt-1">
                  {props.dateFormatter.format(e.scheduledAt)}
                </div>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function StatusBadge({
  status,
  t,
}: {
  status: ExaminationStatus
  t: (k: string) => string
}) {
  const colors: Record<ExaminationStatus, string> = {
    scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
    in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
    completed: 'text-green-700 bg-green-50 border-green-200',
    cancelled: 'text-muted-foreground bg-muted border-muted',
    no_show: 'text-muted-foreground bg-muted border-muted',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs border ${colors[status]}`}
    >
      {t(`examinations.status.${status}`)}
    </span>
  )
}

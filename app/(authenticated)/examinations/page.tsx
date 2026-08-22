import type { ExaminationStatus, RecallStatus } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ExaminationsListView from '@/components/examinations/examinations-list-view'
import { ExaminationsListViewSkeleton } from '@/components/examinations/examinations-list-view-skeleton'
import ScadenteView from '@/components/examinations/scadente-view'
import { ScadenteViewSkeleton } from '@/components/examinations/scadente-view-skeleton'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/auth'
import { type Horizon, VALID_HORIZONS } from '@/lib/examinations/horizon'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

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
 *
 * Streaming: the heading, top-level tabs (with their count badges — a
 * cheap groupBy, kept blocking like the dashboard's tenant-name lookup)
 * and action buttons render as the shell. The actual list content
 * (ScadenteView or ExaminationsListView, whichever tab is active) is
 * the heavy part — multiple joined/paginated queries — so it streams in
 * its own Suspense boundary instead of blocking the shell.
 */

type Tab = 'scadente' | 'programate' | 'in_curs' | 'finalizate' | 'toate'

const VALID_TABS: Tab[] = ['scadente', 'programate', 'in_curs', 'finalizate', 'toate']

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

interface PageProps {
  searchParams: Promise<{
    tab?: string
    horizon?: string
    companyId?: string
    // Backwards-compat: old links used ?status=scheduled directly.
    status?: string
    page?: string
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
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

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
  // soft-deleted-source-exam filter) — one groupBy instead of two counts,
  // since the only difference between them is the status value.
  const [examCounts, scadenteCounts] = await Promise.all([
    prisma.examination.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId, deletedAt: null },
      _count: true,
    }),
    prisma.recall.groupBy({
      by: ['status'],
      where: {
        tenantId: user.tenantId,
        status: { in: ['pending', 'overdue'] as RecallStatus[] },
        deletedAt: null,
        OR: [{ createdFromExaminationId: null }, { createdFromExamination: { deletedAt: null } }],
      },
      _count: true,
    }),
  ])

  const countByStatus = (s: ExaminationStatus): number =>
    examCounts.find((c) => c.status === s)?._count ?? 0
  const totalExams = examCounts.reduce((s, c) => s + c._count, 0)

  const scadenteCountByStatus = (s: RecallStatus): number =>
    scadenteCounts.find((c) => c.status === s)?._count ?? 0
  const overdueScadenteCount = scadenteCountByStatus('overdue')
  const scadenteCount = scadenteCounts.reduce((s, c) => s + c._count, 0)

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

  // CSV export URL — when on an exam tab, scope to that status.
  const exportStatus = tabToStatus(tab)
  const exportUrl = exportStatus
    ? `/api/examinations/export?status=${exportStatus}`
    : '/api/examinations/export'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
            {t('examinations.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('examinations.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'scadente' && (
            <a href={exportUrl} className="text-sm border rounded-md px-3 py-2 hover:bg-muted">
              {t('examinations.exportCsv')}
            </a>
          )}
          {caps.canWriteAdministrative && (
            <Button asChild variant="outline">
              <Link href="/examinations/bulk">Programare în masă</Link>
            </Button>
          )}
          {caps.canWriteAdministrative && (
            <Button asChild>
              <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 text-sm flex-wrap">
        {tabs.map((entry) => {
          const active = tab === entry.key
          const href = `/examinations?tab=${entry.key}`
          const isScadenteWithOverdue = entry.key === 'scadente' && (entry.overdueBadge ?? 0) > 0
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
        <Suspense fallback={<ScadenteViewSkeleton />}>
          <ScadenteView
            tenantId={user.tenantId}
            locale={locale}
            horizon={horizon}
            companyIdFilter={companyIdFilter}
            canWrite={caps.canWriteAdministrative}
            isPractitioner={user.roles.includes('practitioner')}
            userId={user.id}
            today={today}
            t={t}
            page={page}
            searchParams={params}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<ExaminationsListViewSkeleton />}>
          <ExaminationsListView
            tenantId={user.tenantId}
            status={tabToStatus(tab)}
            locale={locale}
            canWrite={caps.canWriteAdministrative}
            t={t}
            page={page}
            total={exportStatus ? countByStatus(exportStatus) : totalExams}
            searchParams={params}
          />
        </Suspense>
      )}
    </div>
  )
}

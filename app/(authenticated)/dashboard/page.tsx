import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import { DashboardGreeting } from '@/components/dashboard-greeting'

/**
 * Dashboard — the first thing a cabinet user sees after logging in.
 *
 * Three sections:
 *   1. Greeting — good morning/afternoon/evening + cabinet name
 *   2. Action cards — overdue recalls (red if > 0), today's exams,
 *      in-progress exams, and unsigned completed exams
 *   3. Quick actions — shortcuts to the most common tasks
 *
 * Data strategy: all counts in a single Promise.all. No heavy queries —
 * each count uses an indexed field (tenantId + status/date). The
 * dashboard is the most-visited page; it must be fast.
 */

export default async function DashboardPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/login')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/login')

  // Today's boundaries in UTC
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setUTCHours(23, 59, 59, 999)

  const [
    tenant,
    overdueRecalls,
    pendingRecalls,
    todayExams,
    inProgressExams,
    unsignedCompleted,
    thisMonthTotal,
    employeeCount,
    companyCount,
  ] = await Promise.all([
    // Cabinet name for the greeting
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    }),

    // Overdue recalls — the most urgent number
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

    // Pending recalls due this week (actionable but not yet overdue)
    prisma.recall.count({
      where: {
        tenantId: user.tenantId,
        status: 'pending',
        dueDate: {
          gte: todayStart,
          lte: new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        deletedAt: null,
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
      },
    }),

    // Examinations scheduled for today
    prisma.examination.count({
      where: {
        tenantId: user.tenantId,
        status: 'scheduled',
        scheduledAt: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
    }),

    // Examinations currently in progress
    prisma.examination.count({
      where: {
        tenantId: user.tenantId,
        status: 'in_progress',
        deletedAt: null,
      },
    }),

    // Completed but not yet signed — the practitioner still needs to
    // sign these to generate the fișa de aptitudine
    prisma.examination.count({
      where: {
        tenantId: user.tenantId,
        status: 'completed',
        signedAt: null,
        deletedAt: null,
      },
    }),

    // This month's total examinations — context for the practitioner
    prisma.examination.count({
      where: {
        tenantId: user.tenantId,
        createdAt: { gte: todayStart, lt: new Date(todayEnd.getTime()) },
        deletedAt: null,
      },
    }),

    // Total active employees in the cabinet
    prisma.employee.count({
      where: {
        tenantId: user.tenantId,
        archivedAt: null,
        deletedAt: null,
      },
    }),

    // Total active companies
    prisma.company.count({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        deletedAt: null,
      },
    }),
  ])

  // Actually "this month" not "today" for monthly total
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const thisMonthExams = await prisma.examination.count({
    where: {
      tenantId: user.tenantId,
      createdAt: { gte: monthStart },
      deletedAt: null,
    },
  })

  const firstName = user.firstName
  const cabinetName = tenant?.name ?? ''

  const urgentCount = overdueRecalls + inProgressExams + unsignedCompleted

  return (
    <div className="space-y-8">
      {/* Greeting — rendered client-side so getHours() uses the browser's local timezone */}
      <DashboardGreeting
        firstName={firstName}
        cabinetName={cabinetName}
        formattedDate={formatDate(new Date(), 'long', locale === 'en' ? 'en' : 'ro')}
        morning={t('dashboard.goodMorning')}
        afternoon={t('dashboard.goodAfternoon')}
        evening={t('dashboard.goodEvening')}
      />

      {/* Urgent items — the "what needs attention NOW" row */}
      {urgentCount > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
            {t('dashboard.needsAttention')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueRecalls > 0 && (
              <AlertCard
                href="/examinations?tab=scadente&horizon=overdue"
                label={t('dashboard.overdueRecalls')}
                value={overdueRecalls}
                tone="destructive"
                description={t('dashboard.overdueRecallsDesc')}
              />
            )}
            {inProgressExams > 0 && (
              <AlertCard
                href="/examinations?tab=in_curs"
                label={t('dashboard.inProgress')}
                value={inProgressExams}
                tone="warning"
                description={t('dashboard.inProgressDesc')}
              />
            )}
            {unsignedCompleted > 0 && (
              <AlertCard
                href="/examinations?tab=finalizate"
                label={t('dashboard.unsignedFise')}
                value={unsignedCompleted}
                tone="warning"
                description={t('dashboard.unsignedFiseDesc')}
              />
            )}
          </div>
        </section>
      )}

      {/* Today section */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
          {t('dashboard.today')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            href="/examinations?tab=programate"
            label={t('dashboard.scheduledToday')}
            value={todayExams}
            accent="primary"
          />
          <StatCard
            href="/examinations?tab=scadente&horizon=thisWeek"
            label={t('dashboard.dueThisWeek')}
            value={pendingRecalls}
            accent="warning"
          />
          <StatCard
            href="/examinations?tab=toate"
            label={t('dashboard.thisMonthExams')}
            value={thisMonthExams}
            accent="muted"
          />
          <StatCard
            href="/employees"
            label={t('dashboard.activeWorkers')}
            value={employeeCount}
            accent="positive"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
          {t('dashboard.quickActions')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {caps.canWriteAdministrative && (
            <>
              <Button asChild>
                <Link href="/examinations/new">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  <span>{t('examinations.newButton')}</span>
                  <kbd className="ml-1 hidden sm:inline-flex items-center rounded border border-white/20 bg-white/10 px-1 py-0 text-[10px] font-mono text-white/80 leading-4">
                    N
                  </kbd>
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/employees/new">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  <span>{t('employees.newButton')}</span>
                </Link>
              </Button>
              {caps.canWrite && (
                <Button asChild variant="outline">
                  <Link href="/companies/new">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    <span>{t('companies.newButton')}</span>
                  </Link>
                </Button>
              )}
            </>
          )}
          <Button asChild variant="outline">
            <Link href="/examinations?tab=scadente">
              {t('dashboard.viewScadente')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reports">
              {t('nav.reports')}
            </Link>
          </Button>
        </div>
      </section>

      {/* Cabinet overview */}
      <section className="border-t pt-6">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium tabular-nums text-foreground">{companyCount}</span>
            <span className="text-[hsl(var(--text-muted))]">{t('dashboard.companies')}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium tabular-nums text-foreground">{employeeCount}</span>
            <span className="text-[hsl(var(--text-muted))]">{t('dashboard.employees')}</span>
          </div>
          <Link
            href="/reports"
            className="ml-auto text-sm text-primary hover:underline"
          >
            {t('dashboard.viewFullReport')} →
          </Link>
        </div>
      </section>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function AlertCard({
  href,
  label,
  value,
  tone,
  description,
}: {
  href: string
  label: string
  value: number
  tone: 'destructive' | 'warning'
  description: string
}) {
  const accent = tone === 'destructive'
    ? 'before:bg-[hsl(var(--accent-danger))]'
    : 'before:bg-[hsl(var(--accent-warning))]'
  const valueColor = tone === 'destructive'
    ? 'text-[hsl(var(--accent-danger))]'
    : 'text-[hsl(var(--accent-warning))]'
  const bg = tone === 'destructive'
    ? 'hover:bg-[hsl(0_72%_50%/0.06)]'
    : 'hover:bg-[hsl(38_92%_38%/0.06)]'

  return (
    <Link
      href={href}
      className={`group relative block rounded-lg border bg-card p-4 transition-colors before:absolute before:left-0 before:top-0 before:h-[2px] before:w-7 before:rounded-b-sm ${accent} ${bg}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div className={`mt-1.5 text-3xl font-medium tabular-nums tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[hsl(var(--text-faint))]">
        {description}
      </div>
    </Link>
  )
}

function StatCard({
  href,
  label,
  value,
  hint,
  accent = 'primary',
}: {
  href: string
  label: string
  value: number
  hint?: string
  accent?: 'primary' | 'positive' | 'warning' | 'danger' | 'muted'
}) {
  const accentClass = {
    primary:  'before:bg-primary',
    positive: 'before:bg-[hsl(var(--accent-positive))]',
    warning:  'before:bg-[hsl(var(--accent-warning))]',
    danger:   'before:bg-[hsl(var(--accent-danger))]',
    muted:    'before:bg-muted-foreground/30',
  }[accent]

  return (
    <Link
      href={href}
      className={`group relative block rounded-lg border bg-card p-4 transition-colors hover:bg-[hsl(var(--surface-tinted))] before:absolute before:left-0 before:top-0 before:h-[2px] before:w-7 before:rounded-b-sm ${accentClass}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div className="mt-1.5 text-3xl font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-[11px] text-[hsl(var(--text-faint))] tabular-nums">
          {hint}
        </div>
      )}
    </Link>
  )
}

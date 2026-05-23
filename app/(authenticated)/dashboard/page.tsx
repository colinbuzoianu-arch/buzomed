import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'

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

  // Greeting: good morning / afternoon / evening
  const hour = new Date().getHours()
  const greetingKey =
    hour < 12
      ? 'dashboard.goodMorning'
      : hour < 18
        ? 'dashboard.goodAfternoon'
        : 'dashboard.goodEvening'

  const firstName = user.firstName
  const cabinetName = tenant?.name ?? ''

  const urgentCount = overdueRecalls + inProgressExams + unsignedCompleted

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t(greetingKey)}, <em>{firstName}</em>.
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {cabinetName}
        </p>
      </div>

      {/* Urgent items — the "what needs attention NOW" row */}
      {urgentCount > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.today')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            href="/examinations?tab=programate"
            label={t('dashboard.scheduledToday')}
            value={todayExams}
          />
          <StatCard
            href="/examinations?tab=scadente&horizon=thisWeek"
            label={t('dashboard.dueThisWeek')}
            value={pendingRecalls}
          />
          <StatCard
            href="/examinations?tab=toate"
            label={t('dashboard.thisMonthExams')}
            value={thisMonthExams}
          />
          <StatCard
            href="/employees"
            label={t('dashboard.activeWorkers')}
            value={employeeCount}
          />
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.quickActions')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {caps.canWriteAdministrative && (
            <>
              <Button asChild>
                <Link href="/examinations/new">
                  + {t('examinations.newButton')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/employees/new">
                  + {t('employees.newButton')}
                </Link>
              </Button>
              {caps.canWrite && (
                <Button asChild variant="outline">
                  <Link href="/companies/new">
                    + {t('companies.newButton')}
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

      {/* Cabinet overview — small context numbers at the bottom */}
      <section className="border-t pt-6">
        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <span>
            <strong className="text-primary font-semibold">{companyCount}</strong>{' '}
            {t('dashboard.companies')}
          </span>
          <span>
            <strong className="text-primary font-semibold">{employeeCount}</strong>{' '}
            {t('dashboard.employees')}
          </span>
          <Link
            href="/reports"
            className="hover:text-foreground transition-colors"
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
  const barColor =
    tone === 'destructive' ? 'before:bg-destructive' : 'before:bg-amber-500'
  const valueColor =
    tone === 'destructive' ? 'text-destructive' : 'text-amber-700'

  return (
    <Link
      href={href}
      className={`relative block border rounded-lg p-4 transition-colors overflow-hidden hover:bg-muted/50 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${barColor}`}
    >
      <div className={`text-[28px] leading-none font-semibold tabular-nums ${valueColor}`}>{value}</div>
      <div className="font-medium mt-1.5 text-sm">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
    </Link>
  )
}

function StatCard({
  href,
  label,
  value,
}: {
  href: string
  label: string
  value: number
}) {
  return (
    <Link
      href={href}
      className="relative block border rounded-lg p-4 hover:bg-muted/50 transition-colors overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-accent"
    >
      <div className="text-[28px] leading-none font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1.5 leading-snug">{label}</div>
    </Link>
  )
}

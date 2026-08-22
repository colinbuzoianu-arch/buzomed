import { prisma } from '@/lib/prisma'
import type { Translator } from '@/lib/i18n'
import { StatCard } from './dashboard-cards'

export default async function DashboardStats({
  tenantId,
  t,
}: {
  tenantId: string
  t: Translator
}) {
  // Today's boundaries in UTC
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setUTCHours(23, 59, 59, 999)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [todayExams, thisWeekExams, pendingRecalls, thisMonthExams, employeeCount] =
    await Promise.all([
      // Examinations scheduled for today
      prisma.examination.count({
        where: {
          tenantId,
          status: 'scheduled',
          scheduledAt: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
      }),

      // Examinations scheduled anytime in the next 7 days (includes today).
      // Distinct from `pendingRecalls` below: this counts appointments
      // already on the calendar, while pendingRecalls counts obligations
      // that haven't been booked yet. A recall booked for later this week
      // flips to Recall.status 'completed' immediately (see
      // examinations/bulk-schedule and recalls/[id]/schedule routes), so
      // without this count it disappears from the dashboard entirely
      // between "today" and "this month".
      prisma.examination.count({
        where: {
          tenantId,
          status: 'scheduled',
          scheduledAt: {
            gte: todayStart,
            lte: new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
          deletedAt: null,
        },
      }),

      // Pending recalls due this week (actionable but not yet overdue)
      prisma.recall.count({
        where: {
          tenantId,
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

      // This month's total examinations — context for the practitioner
      prisma.examination.count({
        where: {
          tenantId,
          createdAt: { gte: monthStart },
          deletedAt: null,
        },
      }),

      // Total active employees in the cabinet
      prisma.employee.count({
        where: {
          tenantId,
          archivedAt: null,
          deletedAt: null,
        },
      }),
    ])

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
        {t('dashboard.today')}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          href="/examinations?tab=programate"
          label={t('dashboard.scheduledToday')}
          value={todayExams}
          accent="primary"
        />
        <StatCard
          href="/examinations?tab=programate"
          label={t('dashboard.scheduledThisWeek')}
          value={thisWeekExams}
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
  )
}

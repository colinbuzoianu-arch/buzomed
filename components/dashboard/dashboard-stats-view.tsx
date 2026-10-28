import type { Translator } from '@/lib/i18n'
import { StatCard } from './dashboard-cards'

export interface DashboardStatsCounts {
  todayExams: number
  thisWeekExams: number
  pendingRecalls: number
  thisMonthExams: number
  employeeCount: number
}

/**
 * Presentational body of the dashboard "Azi" stat row. Extracted from
 * dashboard-stats.tsx so both the real (DB-backed) server component and the
 * sandbox can render identical markup from already-computed counts.
 *
 * `basePath` prefixes the internal hrefs: '' for the real app, '/sandbox'
 * for the demo. Real callers pass nothing, so their output is unchanged.
 */
export function DashboardStatsView({
  counts,
  t,
  basePath = '',
}: {
  counts: DashboardStatsCounts
  t: Translator
  basePath?: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
        {t('dashboard.today')}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          href={`${basePath}/examinations?tab=programate`}
          label={t('dashboard.scheduledToday')}
          value={counts.todayExams}
          accent="primary"
        />
        <StatCard
          href={`${basePath}/examinations?tab=programate`}
          label={t('dashboard.scheduledThisWeek')}
          value={counts.thisWeekExams}
          accent="primary"
        />
        <StatCard
          href={`${basePath}/examinations?tab=scadente&horizon=thisWeek`}
          label={t('dashboard.dueThisWeek')}
          value={counts.pendingRecalls}
          accent="warning"
        />
        <StatCard
          href={`${basePath}/examinations?tab=toate`}
          label={t('dashboard.thisMonthExams')}
          value={counts.thisMonthExams}
          accent="muted"
        />
        <StatCard
          href={`${basePath}/employees`}
          label={t('dashboard.activeWorkers')}
          value={counts.employeeCount}
          accent="positive"
        />
      </div>
    </section>
  )
}

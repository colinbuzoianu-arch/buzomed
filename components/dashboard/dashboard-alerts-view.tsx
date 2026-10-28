import type { Translator } from '@/lib/i18n'
import { AlertCard } from './dashboard-cards'

export interface DashboardAlertsCounts {
  overdueRecalls: number
  inProgressExams: number
  unsignedCompleted: number
}

/**
 * Presentational body of the dashboard "needs attention" alert row.
 * Extracted from dashboard-alerts.tsx so the real server component and the
 * sandbox render identical markup from already-computed counts. Returns null
 * when there is nothing urgent, exactly like the original. `basePath` prefixes
 * internal hrefs (''=real app, '/sandbox'=demo).
 */
export function DashboardAlertsView({
  counts,
  t,
  basePath = '',
}: {
  counts: DashboardAlertsCounts
  t: Translator
  basePath?: string
}) {
  const { overdueRecalls, inProgressExams, unsignedCompleted } = counts
  const urgentCount = overdueRecalls + inProgressExams + unsignedCompleted
  if (urgentCount === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
        {t('dashboard.needsAttention')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {overdueRecalls > 0 && (
          <AlertCard
            href={`${basePath}/examinations?tab=scadente&horizon=overdue`}
            label={t('dashboard.overdueRecalls')}
            value={overdueRecalls}
            tone="destructive"
            description={t('dashboard.overdueRecallsDesc')}
          />
        )}
        {inProgressExams > 0 && (
          <AlertCard
            href={`${basePath}/examinations?tab=in_curs`}
            label={t('dashboard.inProgress')}
            value={inProgressExams}
            tone="warning"
            description={t('dashboard.inProgressDesc')}
          />
        )}
        {unsignedCompleted > 0 && (
          <AlertCard
            href={`${basePath}/examinations?tab=finalizate`}
            label={t('dashboard.unsignedFise')}
            value={unsignedCompleted}
            tone="warning"
            description={t('dashboard.unsignedFiseDesc')}
          />
        )}
      </div>
    </section>
  )
}

import Link from 'next/link'
import { ControlsCardClient } from '@/components/dashboard/controls-card-client'
import { DashboardAlertsView } from '@/components/dashboard/dashboard-alerts-view'
import { DashboardOverviewView } from '@/components/dashboard/dashboard-overview-view'
import { DashboardStatsView } from '@/components/dashboard/dashboard-stats-view'
import { TodayAgendaView } from '@/components/dashboard/today-agenda-view'
import { DashboardGreeting } from '@/components/dashboard-greeting'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import { getTranslator } from '@/lib/i18n'
import { computeDashboard } from '@/lib/sandbox/aggregates'
import { buildFixtures } from '@/lib/sandbox/fixtures'

const BASE = '/sandbox'

/**
 * Sandbox dashboard — the real dashboard, fed with fixture data instead of
 * Prisma. Reuses the extracted presentational views so the layout matches the
 * authenticated product. Rendered on the server from a deterministic dataset;
 * no DB, no auth.
 */
export default function SandboxDashboardPage() {
  const t = getTranslator('ro')
  const data = buildFixtures(new Date())
  const dash = computeDashboard(data, 'ro')

  return (
    <div className="space-y-8">
      <DashboardGreeting
        firstName={data.practitioner.firstName}
        cabinetName={data.cabinetName}
        formattedDate={formatDate(new Date(), 'long', 'ro')}
        morning={t('dashboard.goodMorning')}
        afternoon={t('dashboard.goodAfternoon')}
        evening={t('dashboard.goodEvening')}
      />

      <DashboardAlertsView counts={dash.alerts} t={t} basePath={BASE} />

      <DashboardStatsView counts={dash.stats} t={t} basePath={BASE} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodayAgendaView
          rows={dash.agenda.rows}
          extra={dash.agenda.extra}
          locale="ro"
          t={t}
          basePath={BASE}
        />
        <ControlsCardClient
          overdue={dash.controls.overdue}
          soon={dash.controls.soon}
          overdueCount={dash.controls.overdueCount}
          soonCount={dash.controls.soonCount}
          basePath={BASE}
          labels={{
            title: t('dashboard.controls.title'),
            tabOverdue: t('dashboard.controls.tabOverdue'),
            tabSoon: t('dashboard.controls.tabSoon'),
            viewAll: t('dashboard.controls.viewAll'),
            emptyOverdue: t('dashboard.controls.emptyOverdue'),
            emptySoon: t('dashboard.controls.emptySoon'),
            daysOverdue: t('dashboard.controls.daysOverdue'),
            daysLeft: t('dashboard.controls.daysLeft'),
            dueToday: t('dashboard.controls.dueToday'),
          }}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
          {t('dashboard.quickActions')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`${BASE}/examinations/new`}>
              <span>{t('examinations.newButton')}</span>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${BASE}/examinations?tab=scadente`}>{t('dashboard.viewScadente')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${BASE}/reports`}>{t('nav.reports')}</Link>
          </Button>
        </div>
      </section>

      <DashboardOverviewView
        employeeCount={dash.overview.employeeCount}
        companyCount={dash.overview.companyCount}
        t={t}
        basePath={BASE}
      />
    </div>
  )
}

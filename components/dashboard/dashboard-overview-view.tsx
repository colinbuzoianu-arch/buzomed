import Link from 'next/link'
import type { Translator } from '@/lib/i18n'

/**
 * Presentational body of the dashboard "cabinet overview" footer strip.
 * Extracted from dashboard-overview.tsx so the real server component and the
 * sandbox render identical markup from already-computed counts. `basePath`
 * prefixes the "view full report" href (''=real app, '/sandbox'=demo).
 */
export function DashboardOverviewView({
  employeeCount,
  companyCount,
  t,
  basePath = '',
}: {
  employeeCount: number
  companyCount: number
  t: Translator
  basePath?: string
}) {
  return (
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
        <Link href={`${basePath}/reports`} className="ml-auto text-sm text-primary hover:underline">
          {t('dashboard.viewFullReport')} →
        </Link>
      </div>
    </section>
  )
}

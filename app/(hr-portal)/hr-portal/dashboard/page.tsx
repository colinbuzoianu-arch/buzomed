import { requireUser } from '@/lib/auth'
import { getDictionary, getLocale } from '@/lib/i18n'
import { resolveHrScope } from '@/lib/hr/scope'
import { loadHrDashboardRows } from '@/lib/hr/dashboard-data'
import { aggregateHrDashboard } from '@/lib/hr/dashboard-aggregate'
import { HrDashboardClient, type HrDashboardLabels } from './hr-dashboard-client'

export const metadata = { title: 'Panou SSM — Buzomed' }

export default async function HrDashboardPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const labels = (getDictionary(locale) as { hrDashboard: HrDashboardLabels }).hrDashboard

  const scope = await resolveHrScope(user.id)

  if (!scope.ok) {
    // multi_tenant is a loud configuration error; no_assignments is the normal
    // "not set up yet" state.
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">Nicio companie atribuită</p>
        <p className="text-sm mt-1">
          Contactați administratorul cabinetului pentru a obține acces.
        </p>
      </div>
    )
  }

  const rows = await loadHrDashboardRows(scope)

  // One reference time shared with the client so server-rendered aggregates and
  // any client-side re-aggregation on filter change agree on a single "now".
  const nowMs = Date.now()
  const initialStats = aggregateHrDashboard(rows, { companyId: 'all', workplaceId: 'all' }, nowMs)

  return (
    <HrDashboardClient
      rows={rows}
      companies={scope.companies}
      initialStats={initialStats}
      nowMs={nowMs}
      locale={locale}
      labels={labels}
    />
  )
}

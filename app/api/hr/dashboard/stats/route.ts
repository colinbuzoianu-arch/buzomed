import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { resolveHrScope } from '@/lib/hr/scope'
import { loadHrDashboardRows } from '@/lib/hr/dashboard-data'
import { aggregateHrDashboard, type HrFilter } from '@/lib/hr/dashboard-aggregate'

/**
 * Aggregated HR dashboard stats. Same auth + tenant scoping as the dashboard
 * page (both go through resolveHrScope). Accepts optional `companyId` and
 * `workplaceId` filters so the client can refetch authoritative aggregates;
 * all counting is done server-side over compact, medical-data-free rows.
 */
export async function GET(req: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.roles.includes('company_hr')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const scope = await resolveHrScope(auth.user.id)
  if (!scope.ok) {
    if (scope.error === 'multi_tenant') {
      return NextResponse.json({ error: 'multi_tenant_hr_not_supported' }, { status: 500 })
    }
    return NextResponse.json({
      companies: [],
      filter: { companyId: 'all', workplaceId: 'all' },
      stats: aggregateHrDashboard([], { companyId: 'all', workplaceId: 'all' }, Date.now()),
    })
  }

  const params = req.nextUrl.searchParams
  const requestedCompany = params.get('companyId')
  const filter: HrFilter = {
    // Guard against a filter that points outside the user's scope.
    companyId:
      requestedCompany && scope.companyIds.includes(requestedCompany)
        ? requestedCompany
        : 'all',
    workplaceId: params.get('workplaceId') ?? 'all',
  }

  const rows = await loadHrDashboardRows(scope)
  const stats = aggregateHrDashboard(rows, filter, Date.now())

  return NextResponse.json({ companies: scope.companies, filter, stats })
}

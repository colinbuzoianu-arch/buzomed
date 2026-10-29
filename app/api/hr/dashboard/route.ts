import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { resolveHrScope } from '@/lib/hr/scope'
import { loadHrDashboardRows } from '@/lib/hr/dashboard-data'
import { aggregateHrDashboard } from '@/lib/hr/dashboard-aggregate'

/**
 * Legacy summary endpoint. Kept for backwards compatibility but now shares the
 * tenant scoping (resolveHrScope) and the corrected status resolution
 * (loadHrDashboardRows) with the dashboard page and the /stats route, so its
 * numbers can no longer drift from — or reintroduce the old bugs that the page
 * once had (imported employees miscounted, revoked/unsigned fișe counted).
 */
export async function GET() {
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
    return NextResponse.json({ employees: [], summary: emptySummary() })
  }

  const rows = await loadHrDashboardRows(scope)
  const stats = aggregateHrDashboard(rows, { companyId: 'all', workplaceId: 'all' }, Date.now())

  const employees = stats.rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    jobTitle: r.jobTitle,
    companyId: r.companyId,
    workplace: r.workplaceName ? { id: r.workplaceId, name: r.workplaceName } : null,
    verdict: r.verdictKnown ? r.verdict : null,
    nextExaminationDueDate: r.dueDate,
    status: r.status,
  }))

  return NextResponse.json({
    employees,
    summary: {
      total: stats.summary.total,
      apt: stats.avize.find((s) => s.key === 'apt')?.value ?? 0,
      expiringSoon: stats.summary.expiringSoon,
      missing: stats.summary.noExamination + stats.summary.expired,
    },
  })
}

function emptySummary() {
  return { total: 0, apt: 0, expiringSoon: 0, missing: 0 }
}

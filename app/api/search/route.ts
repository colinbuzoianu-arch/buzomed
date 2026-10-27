import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { MIN_QUERY_LEN, runGlobalSearch } from '@/lib/search/query'

/**
 * GET /api/search?q=
 *
 * Tenant-scoped global search for the ⌘K palette. Same visibility rule as
 * the list pages (canReadTenantData). super_admin has no tenant-data rights,
 * so they get 403 here — the palette is not shown to them in the UI either.
 */
export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ employees: [], companies: [], examinations: [], workplaces: [] })
  }

  try {
    const results = await runGlobalSearch(auth.user.tenantId, q)
    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[api/search] failed', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

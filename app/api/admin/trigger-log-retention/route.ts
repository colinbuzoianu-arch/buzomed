import { type NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { finishCronRun, startCronRun } from '@/lib/cron/run-log'
import { runRetention } from '@/lib/retention/run'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * POST /api/admin/trigger-log-retention
 *
 * Manual trigger for super_admin. Supports dry-run mode — always do a dry-run
 * first before running on production data:
 *
 *   POST /api/admin/trigger-log-retention?dryRun=true   ← see counts, no deletes
 *   POST /api/admin/trigger-log-retention               ← real run, irreversible
 */
export async function POST(request: NextRequest) {
  await requireRole('super_admin')

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'

  const runId = await startCronRun(dryRun ? 'log-retention-dryrun' : 'log-retention')
  try {
    const results = await runRetention(dryRun)
    const total = results.reduce((s, r) => s + r.deleted, 0)
    const errors = results.filter((r) => r.error)
    await finishCronRun(runId, {
      status: errors.length > 0 ? 'failed' : 'success',
      itemsProcessed: total,
      errorCount: errors.length,
      summary: { dryRun, results },
    })
    return NextResponse.json({ dryRun, total, results })
  } catch (err) {
    await finishCronRun(runId, {
      status: 'failed',
      errorMessage: (err as Error).message,
    })
    void logSystemError({
      route: '/api/admin/trigger-log-retention',
      method: 'POST',
      error: err,
      context: { triggeredBy: 'super_admin_manual', dryRun },
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

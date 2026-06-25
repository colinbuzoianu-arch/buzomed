import { type NextRequest, NextResponse } from 'next/server'
import { finishCronRun, startCronRun } from '@/lib/cron/run-log'
import { runRetention } from '@/lib/retention/run'
import { logSystemError } from '@/lib/system-log/error-log'

// Deletion of millions of rows can be slow — allow up to 5 minutes.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Dry-run support: pass ?dryRun=true to see what would be deleted without deleting.
  // The scheduled cron sends no query params so production runs are always real.
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
      route: '/api/cron/log-retention',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

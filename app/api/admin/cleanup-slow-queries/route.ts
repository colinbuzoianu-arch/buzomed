import { type NextRequest, NextResponse } from 'next/server'
import { finishCronRun, startCronRun } from '@/lib/cron/run-log'
import { prisma } from '@/lib/prisma'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * POST/GET /api/admin/cleanup-slow-queries
 *
 * Deletes expired slow_query_logs rows (expiresAt < now). Protected by a
 * shared secret rather than a super_admin session, since it's meant to be
 * called by Vercel Cron (see vercel.json) with no browser session — this
 * path is carved out of the auth middleware allowlist for exactly that
 * reason (see lib/supabase/middleware.ts). Both methods are accepted since
 * Vercel Cron sends GET.
 */
async function handleCleanup(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.SLOW_QUERY_CLEANUP_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'cleanup_secret_not_configured' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('slow-query-log-cleanup')
  try {
    const { count } = await prisma.slowQueryLog.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    await finishCronRun(runId, { status: 'success', itemsProcessed: count })
    return NextResponse.json({ deleted: count })
  } catch (err) {
    await finishCronRun(runId, { status: 'failed', errorMessage: (err as Error).message })
    void logSystemError({
      route: '/api/admin/cleanup-slow-queries',
      method: request.method,
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handleCleanup(request)
}

export async function GET(request: NextRequest) {
  return handleCleanup(request)
}

import { type NextRequest, NextResponse } from 'next/server'
import { sendDueRecallNotifications } from '@/lib/recalls/send-due-notifications'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * POST /api/cron/recall-notifications
 *
 * Sends one email per company whose employees have pending recalls due within
 * 7 days. Protected by CRON_SECRET header — never call directly from the
 * browser; use /api/admin/trigger-recall-notifications instead.
 *
 * Returns { sent, skipped } where skipped = companies with no email address.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendDueRecallNotifications()
    return NextResponse.json(result)
  } catch (err) {
    void logSystemError({
      route: '/api/cron/recall-notifications',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

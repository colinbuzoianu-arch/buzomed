import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { sendDueRecallNotifications } from '@/lib/recalls/send-due-notifications'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * POST /api/admin/trigger-recall-notifications
 *
 * Manual trigger for super_admin. Runs the same recall notification logic
 * as the scheduled cron job without requiring CRON_SECRET.
 */
export async function POST() {
  await requireRole('super_admin')

  try {
    const result = await sendDueRecallNotifications()
    return NextResponse.json(result)
  } catch (err) {
    void logSystemError({
      route: '/api/admin/trigger-recall-notifications',
      method: 'POST',
      error: err,
      context: { triggeredBy: 'super_admin_manual' },
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

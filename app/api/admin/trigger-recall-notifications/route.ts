import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

/**
 * POST /api/admin/trigger-recall-notifications
 *
 * Server-side intermediary so the CRON_SECRET never reaches the browser.
 * Only super_admin can call this; it delegates to the cron route internally.
 */
export async function POST() {
  await requireRole('super_admin')

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/cron/recall-notifications`, {
      method: 'POST',
      headers: {
        'x-cron-secret': process.env.CRON_SECRET ?? '',
      },
    })
  } catch (err) {
    console.error('[trigger-recall-notifications] fetch error:', err)
    return NextResponse.json({ error: 'cron_unreachable' }, { status: 500 })
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error('[trigger-recall-notifications] cron returned', res.status, body)
    return NextResponse.json({ error: 'cron_failed' }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { logSystemError } from '@/lib/system-log/error-log'
import { startCronRun, finishCronRun } from '@/lib/cron/run-log'
import { renderAdminMonthlyInvoiceReminderEmail } from '@/lib/email/templates/subscription/admin-monthly-invoice-reminder'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'
const ADMIN_EMAIL = 'hello@buzomed.com'
const ADMIN_NAME = 'Buzomed Admin'
const SUPER_ADMIN_BASE = `${APP_URL}/super-admin/tenants`

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

/**
 * POST /api/cron/monthly-invoice-reminder
 *
 * Monthly job (06:00 UTC on the 1st, via vercel.json cron) that checks every
 * active Subscription for a PlatformInvoice covering last month's
 * billingPeriod, and emails hello@buzomed.com a single checklist of the
 * tenants missing one. Silent when nothing is missing.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('monthly-invoice-reminder')
  try {
    const now = new Date()
    const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const lastYear = lastMonthDate.getUTCFullYear()
    const lastMonth = lastMonthDate.getUTCMonth() + 1 // 1-12
    const billingPeriod = `${lastYear}-${String(lastMonth).padStart(2, '0')}`
    const periodLabel = `${MONTHS_RO[lastMonth - 1]} ${lastYear}`

    const activeSubs = await prisma.subscription.findMany({
      where: { status: 'active' },
      include: { tenant: { select: { id: true, name: true } } },
    })

    const missing: { tenantId: string; tenantName: string; billingLabel: string; superAdminUrl: string }[] = []

    for (const sub of activeSubs) {
      const existing = await prisma.platformInvoice.findFirst({
        where: { tenantId: sub.tenantId, billingPeriod, deletedAt: null },
        select: { id: true },
      })
      if (existing) continue

      const billingLabel =
        sub.billingMode === 'usage'
          ? `usage — ${sub.platformPricePerExam ?? 5} RON/consultație`
          : sub.tier

      missing.push({
        tenantId: sub.tenantId,
        tenantName: sub.tenant.name,
        billingLabel,
        superAdminUrl: `${SUPER_ADMIN_BASE}/${sub.tenantId}`,
      })
    }

    if (missing.length > 0) {
      const content = renderAdminMonthlyInvoiceReminderEmail({ periodLabel, tenants: missing })
      await sendEmail({
        to: { email: ADMIN_EMAIL, name: ADMIN_NAME },
        content,
        tenantId: null,
        tags: ['admin-monthly-invoice-reminder'],
      })
    }

    await finishCronRun(runId, {
      status: 'success',
      itemsProcessed: missing.length,
      summary: { missing: missing.length, billingPeriod },
    })
    return NextResponse.json({ missing: missing.length })
  } catch (err) {
    await finishCronRun(runId, {
      status: 'failed',
      errorMessage: (err as Error).message,
    })
    void logSystemError({
      route: '/api/cron/monthly-invoice-reminder',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

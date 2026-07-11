import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { generateUnsubscribeUrl } from '@/lib/email/suppression'
import { logSystemError } from '@/lib/system-log/error-log'
import { startCronRun, finishCronRun } from '@/lib/cron/run-log'
import { renderTrialReminderEmail } from '@/lib/email/templates/subscription/trial-reminder'
import { renderTrialExpiredEmail } from '@/lib/email/templates/subscription/trial-expired'
import { renderTrialDeletionWarningEmail } from '@/lib/email/templates/subscription/trial-deletion-warning'
import { renderAdminEnterpriseAlertEmail } from '@/lib/email/templates/subscription/admin-enterprise-alert'
import { renderAdminPastDueAlertEmail } from '@/lib/email/templates/subscription/admin-past-due-alert'
import { renderAdminTrialUnconvertedAlertEmail } from '@/lib/email/templates/subscription/admin-trial-unconverted-alert'
import { renderInvoiceDueSoonEmail } from '@/lib/email/templates/platform-invoice/invoice-due-soon'
import { renderInvoiceOverdueEmail } from '@/lib/email/templates/platform-invoice/invoice-overdue'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'
const BILLING_URL = `${APP_URL}/settings/billing`
const ADMIN_EMAIL = 'hello@buzomed.com'
const ADMIN_NAME = 'Buzomed Admin'
const SUPER_ADMIN_BASE = `${APP_URL}/super-admin/tenants`

/**
 * POST /api/cron/subscription-check
 *
 * Daily job (07:00 UTC via vercel.json cron) that:
 * - Syncs activeEmployeeCount on every live subscription
 * - Transitions trial_active → trial_expired when trialEndsAt has passed
 * - Sends a single trial reminder email, 3 days before expiry (send-once via trialReminderSentAt)
 * - Sends deletion warning 30 days after trialEndsAt (14 days before data deletion)
 * - Transitions active → past_due when a tenant has an issued PlatformInvoice
 *   past its dueDate, and flips that invoice to overdue
 * - Sends a due-soon reminder for invoices due within 3 days (send-once)
 * - Sends overdue reminders to the customer on day 0, 7, and 14 of overdue status
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const runId = await startCronRun('subscription-check')
  try {
  const now = new Date()
  let processed = 0

  // Sync activeEmployeeCount for every live subscription
  const liveSubs = await prisma.subscription.findMany({
    where: { status: { notIn: ['canceled', 'cancelled'] } },
    select: { id: true, tenantId: true },
  })
  for (const s of liveSubs) {
    const count = await prisma.employee.count({
      where: { tenantId: s.tenantId, isActive: true, archivedAt: null, deletedAt: null },
    })
    await prisma.subscription.update({ where: { id: s.id }, data: { activeEmployeeCount: count } })
  }

  // Fetch all non-terminal subscriptions with tenant + practice_admin user.
  // activeEmployeeCount was just synced above, so it reflects the current count.
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ['trial_active', 'trial_expired', 'active', 'past_due'] },
    },
    include: {
      tenant: {
        include: {
          users: {
            where: {
              roles: { has: 'practice_admin' },
              isActive: true,
              deletedAt: null,
            },
            select: { email: true, firstName: true, lastName: true },
            take: 1,
          },
        },
      },
    },
  })

  for (const sub of subscriptions) {
    const tenant = sub.tenant
    const adminUser = tenant.users[0]
    if (!adminUser) continue

    const adminName = `${adminUser.firstName} ${adminUser.lastName}`
    const adminEmail = adminUser.email

    if (sub.status === 'trial_active' && sub.trialEndsAt) {
      const msUntilExpiry = sub.trialEndsAt.getTime() - now.getTime()
      const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24)

      if (daysUntilExpiry < 0) {
        // Trial has expired — transition and send expiry email
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'trial_expired' },
        })
        const content = renderTrialExpiredEmail({
          cabinetName: tenant.name,
          adminName,
          billingUrl: BILLING_URL,
          unsubscribeUrl: generateUnsubscribeUrl(adminEmail),
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tenantId: sub.tenantId, tags: ['trial-expired'] })
        processed++
      } else if (daysUntilExpiry <= 3 && !sub.trialReminderSentAt) {
        // Single consolidated reminder, sent exactly once per trial
        const content = renderTrialReminderEmail({
          cabinetName: tenant.name,
          adminName,
          trialEndsAt: sub.trialEndsAt,
          billingUrl: BILLING_URL,
          unsubscribeUrl: generateUnsubscribeUrl(adminEmail),
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tenantId: sub.tenantId, tags: ['trial-reminder'] })
        await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderSentAt: now } })
        processed++
      }
    }

    if (sub.status === 'trial_expired' && sub.trialEndsAt) {
      const daysSinceExpiry = (now.getTime() - sub.trialEndsAt.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceExpiry >= 30 && daysSinceExpiry < 31) {
        // Day 44 deletion warning (send once around day 30 post-expiry)
        const deletionDate = new Date(sub.trialEndsAt.getTime() + 44 * 24 * 60 * 60 * 1000)
        const content = renderTrialDeletionWarningEmail({
          cabinetName: tenant.name,
          adminName,
          deletionDate,
          billingUrl: BILLING_URL,
          unsubscribeUrl: generateUnsubscribeUrl(adminEmail),
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tenantId: sub.tenantId, tags: ['trial-deletion-warning'] })
        processed++
      }
    }

    // ── ALERT 1: Enterprise threshold ──────────────────────────────────────
    if (sub.status === 'active' && sub.activeEmployeeCount > 2000 && !sub.enterpriseAlertSent) {
      const content = renderAdminEnterpriseAlertEmail({
        cabinetName: tenant.name,
        tenantId: tenant.id,
        activeEmployeeCount: sub.activeEmployeeCount,
        superAdminUrl: `${SUPER_ADMIN_BASE}/${tenant.id}`,
      })
      await sendEmail({ to: { email: ADMIN_EMAIL, name: ADMIN_NAME }, content, tenantId: sub.tenantId, tags: ['admin-enterprise-alert'] })
      await prisma.subscription.update({ where: { id: sub.id }, data: { enterpriseAlertSent: true } })
      processed++
    } else if (sub.activeEmployeeCount <= 2000 && sub.enterpriseAlertSent) {
      // Reset flag when count drops back below threshold
      await prisma.subscription.update({ where: { id: sub.id }, data: { enterpriseAlertSent: false } })
    }

    // ── ALERT 3: Trial expired, not converted, day 7 ───────────────────────
    if (sub.status === 'trial_expired' && sub.trialEndsAt) {
      const daysSinceExpiry = (now.getTime() - sub.trialEndsAt.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceExpiry >= 7 && daysSinceExpiry < 8) {
        const content = renderAdminTrialUnconvertedAlertEmail({
          cabinetName: tenant.name,
          tenantId: tenant.id,
          employeeCount: sub.activeEmployeeCount,
          trialExpiredAt: sub.trialEndsAt,
          superAdminUrl: `${SUPER_ADMIN_BASE}/${tenant.id}`,
        })
        await sendEmail({ to: { email: ADMIN_EMAIL, name: ADMIN_NAME }, content, tenantId: sub.tenantId, tags: ['admin-trial-unconverted'] })
        processed++
      }
    }
  }

  // ── Overdue invoices: flip status + transition active subscriptions to past_due ──
  // Billing is now manual (bank transfer against a factura), so "past due" is driven
  // by an unpaid PlatformInvoice past its dueDate, not a Stripe currentPeriodEnd.
  const overdueInvoices = await prisma.platformInvoice.findMany({
    where: { status: 'issued', dueDate: { lt: now }, deletedAt: null },
    include: { tenant: { select: { id: true, name: true } } },
  })

  for (const invoice of overdueInvoices) {
    await prisma.platformInvoice.update({ where: { id: invoice.id }, data: { status: 'overdue' } })

    const sub = await prisma.subscription.findFirst({
      where: { tenantId: invoice.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    if (sub && sub.status === 'active') {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due', pastDueAlertSent: true },
      })
    }

    const daysPastDue = invoice.dueDate
      ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const content = renderAdminPastDueAlertEmail({
      cabinetName: invoice.tenant.name,
      tenantId: invoice.tenantId,
      daysPastDue,
      superAdminUrl: `${SUPER_ADMIN_BASE}/${invoice.tenantId}`,
    })
    await sendEmail({ to: { email: ADMIN_EMAIL, name: ADMIN_NAME }, content, tenantId: invoice.tenantId, tags: ['admin-past-due-alert'] })
    processed++
  }

  // ── Due-soon reminder: courtesy nudge, sent once, for invoices due within 3 days ──
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const dueSoonInvoices = await prisma.platformInvoice.findMany({
    where: {
      status: 'issued',
      deletedAt: null,
      dueDate: { gte: now, lte: threeDaysFromNow },
      dueSoonReminderSentAt: null,
    },
    include: { tenant: { select: { id: true, name: true, email: true } } },
  })

  // Independent per-invoice work (different rows, no shared state) — send in
  // parallel instead of one round trip at a time.
  await Promise.all(
    dueSoonInvoices.map(async (invoice) => {
      const recipientEmail = invoice.snapshotTenantEmail ?? invoice.tenant.email
      if (!recipientEmail || !invoice.dueDate) return
      const content = renderInvoiceDueSoonEmail({
        tenantName: invoice.snapshotTenantName ?? invoice.tenant.name,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total.toString(),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        billingUrl: BILLING_URL,
        unsubscribeUrl: generateUnsubscribeUrl(recipientEmail),
      })
      await sendEmail({ to: { email: recipientEmail, name: invoice.tenant.name }, content, tenantId: invoice.tenantId, tags: ['invoice-due-soon'] })
      await prisma.platformInvoice.update({ where: { id: invoice.id }, data: { dueSoonReminderSentAt: now } })
      processed++
    })
  )

  // ── Overdue reminder: customer-facing, day 0 then every ~7 days, capped at 3 ──
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const overdueForReminder = await prisma.platformInvoice.findMany({
    where: {
      status: 'overdue',
      deletedAt: null,
      overdueReminderCount: { lt: 3 },
      OR: [{ lastOverdueReminderAt: null }, { lastOverdueReminderAt: { lte: sevenDaysAgo } }],
    },
    include: { tenant: { select: { id: true, name: true, email: true } } },
  })

  await Promise.all(
    overdueForReminder.map(async (invoice) => {
      const recipientEmail = invoice.snapshotTenantEmail ?? invoice.tenant.email
      if (!recipientEmail) return
      const daysPastDue = invoice.dueDate
        ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0
      const content = renderInvoiceOverdueEmail({
        tenantName: invoice.snapshotTenantName ?? invoice.tenant.name,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total.toString(),
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        daysPastDue,
        billingUrl: BILLING_URL,
        unsubscribeUrl: generateUnsubscribeUrl(recipientEmail),
      })
      await sendEmail({ to: { email: recipientEmail, name: invoice.tenant.name }, content, tenantId: invoice.tenantId, tags: ['invoice-overdue'] })
      await prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: { overdueReminderCount: { increment: 1 }, lastOverdueReminderAt: now },
      })
      processed++
    })
  )

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  await prisma.systemErrorLog.deleteMany({ where: { createdAt: { lt: cutoff } } })

  await finishCronRun(runId, {
    status: 'success',
    itemsProcessed: processed,
    summary: { processed },
  })
  return NextResponse.json({ processed })
  } catch (err) {
    await finishCronRun(runId, {
      status: 'failed',
      errorMessage: (err as Error).message,
    })
    void logSystemError({
      route: '/api/cron/subscription-check',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

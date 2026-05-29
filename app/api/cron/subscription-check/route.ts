import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { renderTrialDay7Email } from '@/lib/email/templates/subscription/trial-day7'
import { renderTrialDay11Email } from '@/lib/email/templates/subscription/trial-day11'
import { renderTrialExpiredEmail } from '@/lib/email/templates/subscription/trial-expired'
import { renderTrialDeletionWarningEmail } from '@/lib/email/templates/subscription/trial-deletion-warning'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'
const BILLING_URL = `${APP_URL}/settings/billing`

/**
 * POST /api/cron/subscription-check
 *
 * Daily job (07:00 UTC via vercel.json cron) that:
 * - Syncs activeEmployeeCount on every live subscription
 * - Transitions trial_active → trial_expired when trialEndsAt has passed
 * - Sends reminder emails at day 7 and day 11 (3 days before expiry)
 * - Sends deletion warning 30 days after trialEndsAt (14 days before data deletion)
 * - Transitions active → past_due when currentPeriodEnd has passed
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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
      status: { in: ['trial_active', 'trial_expired', 'active'] },
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
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tags: ['trial-expired'] })
        processed++
      } else if (daysUntilExpiry <= 3) {
        // Day 11 email (3 days left)
        const content = renderTrialDay11Email({
          cabinetName: tenant.name,
          adminName,
          trialEndsAt: sub.trialEndsAt,
          billingUrl: BILLING_URL,
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tags: ['trial-day11'] })
        processed++
      } else if (daysUntilExpiry <= 7) {
        // Day 7 email — variant based on active employee count
        const content = renderTrialDay7Email({
          cabinetName: tenant.name,
          adminName,
          trialEndsAt: sub.trialEndsAt,
          billingUrl: BILLING_URL,
          employeeCount: sub.activeEmployeeCount,
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tags: ['trial-day7'] })
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
        })
        await sendEmail({ to: { email: adminEmail, name: adminName }, content, tags: ['trial-deletion-warning'] })
        processed++
      }
    }

    if (sub.status === 'active' && sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due' },
      })
      processed++
    }
  }

  return NextResponse.json({ processed })
}

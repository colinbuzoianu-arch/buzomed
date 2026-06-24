import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { renderPaymentFailedEmail } from '@/lib/email/templates/subscription/payment-failed'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })
  }

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // Deduplicate: Stripe retries aggressively and occasionally double-delivers.
  // A unique-constraint violation (P2002) on event_id means we already handled
  // this event — return 200 so Stripe stops retrying without re-processing.
  try {
    await prisma.processedStripeEvent.create({
      data: { eventId: event.id, eventType: event.type },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true, deduplicated: true })
    }
    throw err
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const tenantId = session.metadata?.tenantId
      const planId = session.metadata?.planId
      const tier = session.metadata?.tier

      if (!tenantId) break

      const stripeSubId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null

      let periodEnd: Date | null = null
      if (stripeSubId) {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
          expand: ['items'],
        })
        // In Stripe API 2026+, current_period_end lives on subscription items
        const periodEndTs = stripeSub.items.data[0]?.current_period_end
        if (periodEndTs) periodEnd = new Date(periodEndTs * 1000)
      }

      const sub = await prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })

      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'active',
            stripeSubscriptionId: stripeSubId,
            planId: planId ?? null,
            tier: (tier as 'starter' | 'growth' | 'pro' | 'enterprise') ?? sub.tier,
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
          },
        })
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      const rawSub = invoice.parent?.subscription_details?.subscription
      const invoiceSubId = !rawSub ? null : typeof rawSub === 'string' ? rawSub : rawSub.id

      if (!customerId || !invoiceSubId) break

      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        include: {
          tenant: {
            include: {
              users: {
                where: { roles: { has: 'practice_admin' }, isActive: true, deletedAt: null },
                select: { email: true, firstName: true, lastName: true },
                take: 1,
              },
            },
          },
        },
      })

      if (!sub || invoiceSubId !== sub.stripeSubscriptionId) break

      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due' },
      })

      const adminUser = sub.tenant.users[0]
      if (adminUser) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'
        const content = renderPaymentFailedEmail({
          cabinetName: sub.tenant.name,
          adminName: `${adminUser.firstName} ${adminUser.lastName}`,
          billingUrl: `${appUrl}/settings/billing`,
        })
        await sendEmail({
          to: { email: adminUser.email, name: `${adminUser.firstName} ${adminUser.lastName}` },
          content,
          tags: ['payment-failed'],
        })
      }
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
      const rawSub = invoice.parent?.subscription_details?.subscription
      const invoiceSubId = !rawSub ? null : typeof rawSub === 'string' ? rawSub : rawSub.id

      if (!customerId || !invoiceSubId) break

      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      })
      if (!sub || invoiceSubId !== sub.stripeSubscriptionId) break

      // Refresh period end from the linked Stripe subscription if we have one stored
      let periodEnd: Date | null = sub.currentPeriodEnd
      if (sub.stripeSubscriptionId) {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, { expand: ['items'] })
        const periodEndTs = stripeSub.items.data[0]?.current_period_end
        if (periodEndTs) periodEnd = new Date(periodEndTs * 1000)
      }

      // Re-activate past_due subscriptions on successful payment and refresh period.
      // Reset pastDueAlertSent so the alert fires again if they go past_due again.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          currentPeriodEnd: periodEnd,
          pastDueAlertSent: false,
        },
      })
      break
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription
      const subId = stripeSub.id

      const sub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subId },
      })
      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'canceled', canceledAt: new Date() },
        })
      }
      break
    }

    default:
      // Unhandled event types — ignore silently
      break
  }

  return NextResponse.json({ received: true })
}

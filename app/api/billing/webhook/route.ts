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

      if (!customerId) break

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

      if (!sub) break

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

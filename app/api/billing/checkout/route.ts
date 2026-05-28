import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
}

export async function POST(request: Request) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 })
  }

  let body: { planId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.planId) {
    return NextResponse.json({ error: 'missing_plan_id' }, { status: 400 })
  }

  const plan = await prisma.plan.findUnique({ where: { id: body.planId } })
  if (!plan || !plan.isPublic) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.user.tenantId },
    select: { name: true, email: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  // Look up or create Stripe customer for this tenant
  const sub = await prisma.subscription.findFirst({
    where: { tenantId: auth.user.tenantId },
    orderBy: { createdAt: 'desc' },
  })

  let stripeCustomerId = sub?.stripeCustomerId ?? null
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: tenant.name,
      email: tenant.email ?? undefined,
      metadata: { tenantId: auth.user.tenantId },
    })
    stripeCustomerId = customer.id
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { stripeCustomerId },
      })
    }
  }

  // Price lookup key convention: "plan_{tier}_monthly"
  const priceData: Stripe.Checkout.SessionCreateParams.LineItem = {
    price_data: {
      currency: 'ron',
      unit_amount: Math.round(Number(plan.monthlyPrice) * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: `Buzomed ${plan.name}`,
        metadata: { planId: plan.id, tier: plan.tier },
      },
    },
    quantity: 1,
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [priceData],
    success_url: `${appUrl}/settings/billing?checkout=success`,
    cancel_url: `${appUrl}/settings/billing?checkout=canceled`,
    metadata: { tenantId: auth.user.tenantId, planId: plan.id, tier: plan.tier },
    subscription_data: {
      metadata: { tenantId: auth.user.tenantId, planId: plan.id },
    },
  })

  return NextResponse.json({ url: session.url })
}

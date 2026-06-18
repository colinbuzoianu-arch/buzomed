import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSystemError } from '@/lib/system-log/error-log'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
}

export async function POST() {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 })
  }

  const sub = await prisma.subscription.findFirst({
    where: { tenantId: auth.user.tenantId },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  })

  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'no_stripe_customer' }, { status: 404 })
  }

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch (err) {
    await logSystemError({
      tenantId: auth.user.tenantId,
      route: '/api/billing/portal',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  let session: Stripe.BillingPortal.Session
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    })
  } catch (err) {
    await logSystemError({
      tenantId: auth.user.tenantId,
      route: '/api/billing/portal',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'stripe_portal_error' }, { status: 502 })
  }

  return NextResponse.json({ url: session.url })
}

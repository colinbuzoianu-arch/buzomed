import { NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { PlanTier } from '@prisma/client'

const VALID_TIERS: PlanTier[] = ['starter', 'growth', 'pro', 'enterprise']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { tenantId } = await params

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } })
  if (!tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })
  }

  let body: { action: string; days?: number; tier?: PlanTier; note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const sub = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } })

  switch (body.action) {
    case 'extend_trial': {
      const days = typeof body.days === 'number' ? body.days : 7
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date()
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEndsAt: newEnd, status: 'trial_active' },
      })
      return NextResponse.json({ message: `Trial extins cu ${days} zile.` })
    }

    case 'change_tier': {
      if (!body.tier || !VALID_TIERS.includes(body.tier)) {
        return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })
      }
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      const plan = await prisma.plan.findFirst({ where: { tier: body.tier } })
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { tier: body.tier, planId: plan?.id ?? null },
      })
      return NextResponse.json({ message: `Plan schimbat la ${body.tier}.` })
    }

    case 'mark_comp': {
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'comp', tier: 'enterprise' },
      })
      return NextResponse.json({ message: 'Cabinet marcat ca plan comp.' })
    }

    case 'activate': {
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'active' },
      })
      return NextResponse.json({ message: 'Subscripție activată.' })
    }

    case 'suspend': {
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'suspended' },
      })
      return NextResponse.json({ message: 'Subscripție suspendată.' })
    }

    case 'add_note': {
      if (!body.note || typeof body.note !== 'string') {
        return NextResponse.json({ error: 'missing_note' }, { status: 400 })
      }
      if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { notes: body.note },
      })
      return NextResponse.json({ message: 'Notă salvată.' })
    }

    case 'create_trial': {
      if (sub) return NextResponse.json({ error: 'subscription_exists' }, { status: 409 })
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      await prisma.subscription.create({
        data: { tenantId, tier: 'starter', status: 'trial_active', trialEndsAt },
      })
      return NextResponse.json({ message: 'Trial creat (14 zile).' })
    }

    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }
}

import { redirect } from 'next/navigation'
import Stripe from 'stripe'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantSubscription, countActiveEmployees } from '@/lib/subscription'
import { BillingClient, type StripeInvoice } from './billing-client'

export const metadata = { title: 'Facturare & Abonament — Buzomed' }

async function fetchStripeInvoices(stripeCustomerId: string): Promise<StripeInvoice[]> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return []
  const stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  try {
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 12,
      status: 'paid',
    })
    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? inv.id,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    }))
  } catch {
    return []
  }
}

export default async function BillingPage() {
  const user = await requireUser()

  if (!user.tenantId || !user.roles.includes('practice_admin')) {
    redirect('/dashboard')
  }

  const [subscription, rawPlans, employeeCount] = await Promise.all([
    getTenantSubscription(user.tenantId),
    prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { monthlyPrice: 'asc' },
    }),
    countActiveEmployees(user.tenantId),
  ])

  const invoices = subscription?.stripeCustomerId
    ? await fetchStripeInvoices(subscription.stripeCustomerId)
    : []

  // Decimal is not serializable to Client Components — convert to number
  const plans = rawPlans.map((p) => ({ ...p, monthlyPrice: Number(p.monthlyPrice) }))
  const serializedSubscription = subscription
    ? {
        ...subscription,
        plan: subscription.plan
          ? { ...subscription.plan, monthlyPrice: Number(subscription.plan.monthlyPrice) }
          : null,
      }
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Facturare &amp; Abonament</h1>
        <p className="text-muted-foreground mt-1">
          Gestionează planul și metodele de plată pentru cabinet.
        </p>
      </div>
      <BillingClient
        subscription={serializedSubscription}
        plans={plans}
        employeeCount={employeeCount}
        invoices={invoices}
      />
    </div>
  )
}

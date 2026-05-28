import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTenantSubscription, countActiveEmployees } from '@/lib/subscription'
import { BillingClient } from './billing-client'

export const metadata = { title: 'Facturare & Abonament — Buzomed' }

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
      />
    </div>
  )
}

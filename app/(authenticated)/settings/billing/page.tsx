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

  const [subscription, rawPlans, employeeCount, rawInvoices] = await Promise.all([
    getTenantSubscription(user.tenantId),
    prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { monthlyPrice: 'asc' },
    }),
    countActiveEmployees(user.tenantId),
    prisma.platformInvoice.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ invoiceYear: 'desc' }, { invoiceSequence: 'desc' }],
      include: { items: true },
    }),
  ])

  // Decimal is not serializable to Client Components — convert to number
  const plans = rawPlans.map((p) => ({ ...p, monthlyPrice: Number(p.monthlyPrice) }))
  const serializedSubscription = subscription
    ? {
        ...subscription,
        platformPricePerExam: subscription.platformPricePerExam
          ? Number(subscription.platformPricePerExam)
          : null,
        plan: subscription.plan
          ? { ...subscription.plan, monthlyPrice: Number(subscription.plan.monthlyPrice) }
          : null,
      }
    : null
  const invoices = rawInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    billingPeriod: inv.billingPeriod,
    issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    total: inv.total.toString(),
    currency: inv.currency,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Facturare &amp; Abonament</h1>
        <p className="text-muted-foreground mt-1">
          Gestionează planul și consultă istoricul facturilor pentru cabinet.
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

'use client'

import type { Plan, Subscription } from '@prisma/client'
import { InvoiceStatusBadge } from '@/components/ui/invoice-status-badge'

type SerializedPlan = Omit<Plan, 'monthlyPrice'> & { monthlyPrice: number }

export interface PlatformInvoiceRow {
  id: string
  invoiceNumber: string
  status: string
  billingPeriod: string | null
  issuedAt: string | null
  dueDate: string | null
  paidAt: string | null
  total: string
  currency: string
}

interface BillingClientProps {
  subscription:
    | (Omit<Subscription, 'platformPricePerExam'> & {
        platformPricePerExam: number | null
        plan: SerializedPlan | null
      })
    | null
  plans: SerializedPlan[]
  employeeCount: number
  invoices: PlatformInvoiceRow[]
}

const STATUS_LABELS: Record<string, string> = {
  trial_active: 'Trial activ',
  trial_expired: 'Trial expirat',
  active: 'Activ',
  past_due: 'Plată restantă',
  canceled: 'Anulat',
  cancelled: 'Anulat',
  suspended: 'Suspendat',
  comp: 'Plan personalizat',
}

const STATUS_COLORS: Record<string, string> = {
  trial_active: 'bg-blue-100 text-blue-800',
  trial_expired: 'bg-red-100 text-red-800',
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-800',
  comp: 'bg-violet-100 text-violet-800',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtPeriod(inv: PlatformInvoiceRow) {
  if (inv.billingPeriod) {
    const [year, month] = inv.billingPeriod.split('-')
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('ro-RO', {
      month: 'short',
      year: 'numeric',
    })
    return label
  }
  return fmtDate(inv.issuedAt)
}

export function BillingClient({ subscription, plans, employeeCount, invoices }: BillingClientProps) {
  const status = subscription?.status ?? 'trial_expired'
  const isComp = status === 'comp'
  const isPayingCustomer = status === 'active' || status === 'past_due' || status === 'comp' || status === 'suspended'
  const showPricingTable = status === 'trial_active' || status === 'trial_expired' || !subscription
  const billingMode = subscription?.billingMode ?? 'flat'

  return (
    <div className="space-y-6">
      {/* Current plan card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
              Plan curent
            </h2>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-xl font-semibold">
                {isPayingCustomer && billingMode === 'usage'
                  ? 'Facturare pe consultații'
                  : isComp
                    ? 'Enterprise'
                    : (subscription?.plan?.name ?? 'Starter')}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
            {isPayingCustomer && billingMode === 'usage' && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {subscription?.platformPricePerExam ?? 5} RON / consultație finalizată
              </p>
            )}
            {subscription?.trialEndsAt && status === 'trial_active' && (() => {
              const trialEnd = new Date(subscription.trialEndsAt)
              const trialStart = new Date(trialEnd.getTime() - 14 * 24 * 60 * 60 * 1000)
              const totalMs = trialEnd.getTime() - trialStart.getTime()
              const elapsedMs = Date.now() - trialStart.getTime()
              const pct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)))
              const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              return (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {daysLeft} {daysLeft === 1 ? 'zi' : 'zile'} rămase · expiră pe{' '}
                    {trialEnd.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )
            })()}
          </div>
          <div className="text-right">
            <div className="text-[13px] text-muted-foreground">Angajați activi</div>
            <div className="text-2xl font-bold">{employeeCount}</div>
          </div>
        </div>
      </div>

      {/* Enterprise threshold warning — shown when approaching Pro limit */}
      {status === 'active' && subscription?.tier === 'pro' && employeeCount > 1800 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ai <strong>{employeeCount}</strong> angajați activi. La 2 000 vei atinge limita planului Pro.
          Pentru a continua fără întrerupere, contactează-ne la{' '}
          <a href="mailto:hello@buzomed.com" className="underline hover:text-amber-700">
            hello@buzomed.com
          </a>{' '}
          pentru un plan Enterprise.
        </div>
      )}

      {/* Already a paying customer — no self-serve plan switching, no pricing table */}
      {isPayingCustomer && !isComp && billingMode === 'flat' && (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-[13px] text-foreground">
            Planul tău actual: <strong className="capitalize">{subscription?.tier}</strong>.
            Pentru schimbări de plan, contactează-ne la{' '}
            <a href="mailto:hello@buzomed.com" className="underline underline-offset-2">
              hello@buzomed.com
            </a>.
          </p>
        </div>
      )}

      {isComp && (
        <div className="rounded-lg border bg-violet-50 p-6">
          <p className="text-[13px] text-violet-800">
            Cabinetul tău beneficiază de un plan personalizat. Pentru modificări, contactează{' '}
            <a href="mailto:hello@buzomed.com" className="underline underline-offset-2">
              hello@buzomed.com
            </a>.
          </p>
        </div>
      )}

      {/* Plan comparison — only shown before conversion (trial, no subscription) */}
      {showPricingTable && (
        <div>
          <h2 className="text-[13px] font-medium text-foreground mb-4">Planuri disponibile</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = subscription?.plan?.id === plan.id
              const tierLabel = plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)
              const price = plan.monthlyPrice
              const maxEmp = plan.maxEmployees === -1 ? 'nelimitat' : `până la ${plan.maxEmployees}`

              return (
                <div
                  key={plan.id}
                  className={`rounded-lg border p-5 flex flex-col gap-4 ${
                    isCurrent ? 'border-primary ring-1 ring-primary' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-lg">{tierLabel}</span>
                      {isCurrent && (
                        <span className="text-xs font-medium text-primary">Plan curent</span>
                      )}
                    </div>
                    <div className="mt-1">
                      <span className="text-2xl font-bold">{price > 0 ? `${price} RON` : 'Personalizat'}</span>
                      {price > 0 && <span className="text-[13px] text-muted-foreground"> / lună</span>}
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-1">{maxEmp} angajați</p>
                  </div>
                  {!isCurrent && (
                    <a
                      href="mailto:hello@buzomed.com"
                      className="mt-auto h-9 w-full flex items-center justify-center rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
                    >
                      Contactează-ne
                    </a>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[12px] text-muted-foreground mt-3">
            Ai nevoie de mai mult de 2000 de angajați?{' '}
            <a href="mailto:hello@buzomed.com" className="underline underline-offset-2">
              Contactează-ne
            </a>{' '}
            pentru un plan Enterprise personalizat.
          </p>
        </div>
      )}

      {/* Invoice history */}
      <div>
        <h2 className="text-[13px] font-medium text-foreground mb-3">Istoric facturi</h2>
        {invoices.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nicio factură emisă încă.</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-[13px] gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground tabular-nums">{fmtPeriod(inv)}</span>
                  <span className="font-mono font-medium">{inv.invoiceNumber}</span>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums">{Number(inv.total).toFixed(2)} {inv.currency}</span>
                  {inv.status !== 'draft' && (
                    <a
                      href={`/api/super-admin/platform-invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Plan, Subscription } from '@prisma/client'
import { toastError } from '@/lib/toast'

type SerializedPlan = Omit<Plan, 'monthlyPrice'> & { monthlyPrice: number }

export interface StripeInvoice {
  id: string
  number: string
  amountPaid: number
  currency: string
  periodStart: number
  periodEnd: number
  hostedInvoiceUrl: string | null
}

interface BillingClientProps {
  subscription: (Subscription & { plan: SerializedPlan | null }) | null
  plans: SerializedPlan[]
  employeeCount: number
  invoices: StripeInvoice[]
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

export function BillingClient({ subscription, plans, employeeCount, invoices }: BillingClientProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const status = subscription?.status ?? 'trial_expired'
  const isComp = status === 'comp'
  const isActive = status === 'active'

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (!res.ok) {
        toastError('Eroare la deschiderea portalului de facturare.')
        return
      }
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      toastError('Eroare de conexiune. Încearcă din nou.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleCheckout(planId: string) {
    setLoading(planId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toastError(data.error ?? 'Eroare la inițierea plății.')
        return
      }
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      toastError('Eroare de conexiune. Încearcă din nou.')
    } finally {
      setLoading(null)
    }
  }

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
                {isComp ? 'Enterprise' : (subscription?.plan?.name ?? 'Starter')}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
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
            {subscription?.currentPeriodEnd && status === 'active' && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                Reînnoire pe{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString('ro-RO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <div className="text-[13px] text-muted-foreground">Angajați activi</div>
              <div className="text-2xl font-bold">{employeeCount}</div>
            </div>
            {isActive && (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="h-8 px-3 rounded-md border text-[13px] font-medium hover:bg-accent disabled:opacity-60 transition-colors"
              >
                {portalLoading ? 'Se deschide...' : 'Gestionează abonamentul'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan comparison — hidden for comp */}
      {!isComp && (
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
                    <button
                      onClick={() => handleCheckout(plan.id)}
                      disabled={loading === plan.id}
                      className="mt-auto h-9 w-full rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                    >
                      {loading === plan.id ? 'Se procesează...' : 'Activează'}
                    </button>
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

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div>
          <h2 className="text-[13px] font-medium text-foreground mb-3">Istoric facturi</h2>
          <div className="rounded-lg border divide-y">
            {invoices.map((inv) => {
              const amount = (inv.amountPaid / 100).toLocaleString('ro-RO', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
              const currency = inv.currency.toUpperCase()
              const period = `${new Date(inv.periodStart * 1000).toLocaleDateString('ro-RO', { month: 'short', year: 'numeric' })}`
              return (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground tabular-nums">{period}</span>
                    <span className="font-medium">{inv.number}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="tabular-nums">{amount} {currency}</span>
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        Descarcă
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import type { Plan, Subscription } from '@prisma/client'

type SerializedPlan = Omit<Plan, 'monthlyPrice'> & { monthlyPrice: number }
import { toastError } from '@/lib/toast'

interface BillingClientProps {
  subscription: (Subscription & { plan: SerializedPlan | null }) | null
  plans: SerializedPlan[]
  employeeCount: number
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

export function BillingClient({ subscription, plans, employeeCount }: BillingClientProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const status = subscription?.status ?? 'trial_expired'
  const isComp = status === 'comp'

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
            {subscription?.trialEndsAt && status === 'trial_active' && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                Trial expiră pe{' '}
                {new Date(subscription.trialEndsAt).toLocaleDateString('ro-RO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
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
          <div className="text-right">
            <div className="text-[13px] text-muted-foreground">Angajați activi</div>
            <div className="text-2xl font-bold">{employeeCount}</div>
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
    </div>
  )
}

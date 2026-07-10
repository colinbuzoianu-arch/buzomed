'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toastSuccess, toastError } from '@/lib/toast'
import type { BillingMode, PlanTier, SubscriptionStatus } from '@prisma/client'

interface Props {
  tenantId: string
  tenantName: string
  subscription: {
    id: string
    status: SubscriptionStatus
    tier: PlanTier
    trialEndsAt: Date | null
    notes: string | null
    billingMode: BillingMode
    platformPricePerExam: number | null
  } | null
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

const TIER_OPTIONS: PlanTier[] = ['starter', 'growth', 'pro', 'enterprise']

export function SubscriptionActions({ tenantId, tenantName, subscription }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [selectedTier, setSelectedTier] = useState<PlanTier>(subscription?.tier ?? 'starter')
  const [billingMode, setBillingMode] = useState<BillingMode>(subscription?.billingMode ?? 'flat')
  const [pricePerExam, setPricePerExam] = useState<number>(
    subscription?.platformPricePerExam ?? 5
  )

  const base = `/api/admin/subscriptions/${tenantId}`

  async function doAction(action: string, payload?: object, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(true)
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'A apărut o eroare.')
        return
      }
      toastSuccess(data.message ?? 'Actualizat.')
      router.refresh()
    } catch {
      toastError('Eroare de conexiune.')
    } finally {
      setBusy(false)
    }
  }

  if (!subscription) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[13px] text-muted-foreground">
        Nicio subscripție găsită pentru acest cabinet.
        <button
          className="ml-2 text-primary underline underline-offset-2"
          disabled={busy}
          onClick={() => doAction('create_trial', {}, `Creează trial pentru "${tenantName}"?`)}
        >
          Creează trial
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
            Subscripție
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold capitalize">{subscription.tier}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
              subscription.status === 'active' ? 'bg-green-100 text-green-800' :
              subscription.status === 'trial_active' ? 'bg-blue-100 text-blue-800' :
              subscription.status === 'comp' ? 'bg-violet-100 text-violet-800' :
              'bg-red-100 text-red-800'
            }`}>
              {STATUS_LABELS[subscription.status] ?? subscription.status}
            </span>
          </div>
          {subscription.trialEndsAt && (
            <div className="text-[12px] text-muted-foreground mt-1">
              Trial expiră:{' '}
              {new Date(subscription.trialEndsAt).toLocaleDateString('ro-RO', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          )}
          {subscription.notes && (
            <div className="text-[12px] text-muted-foreground mt-1 italic">{subscription.notes}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('extend_trial', { days: 7 }, `Extinde trial cu 7 zile pentru "${tenantName}"?`)}
        >
          +7 zile trial
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('extend_trial', { days: 14 }, `Extinde trial cu 14 zile pentru "${tenantName}"?`)}
        >
          +14 zile trial
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('mark_comp', {}, `Marchează "${tenantName}" ca plan comp (personalizat)?`)}
        >
          Marchează comp
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('activate', {}, `Activează subscripția pentru "${tenantName}"?`)}
        >
          Activează
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('suspend', {}, `Suspendă subscripția pentru "${tenantName}"?`)}
        >
          Suspendă
        </Button>
      </div>

      {/* Change tier */}
      <div className="flex items-center gap-2">
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value as PlanTier)}
          className="h-8 rounded-md border bg-background px-2 text-[13px]"
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => doAction('change_tier', { tier: selectedTier }, `Schimbă planul la "${selectedTier}" pentru "${tenantName}"?`)}
        >
          Schimbă plan
        </Button>
      </div>

      {/* Billing mode */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Mod de facturare
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={billingMode}
            onChange={(e) => setBillingMode(e.target.value as BillingMode)}
            className="h-8 rounded-md border bg-background px-2 text-[13px]"
          >
            <option value="flat">Flat (abonament)</option>
            <option value="usage">Usage (per consultație)</option>
          </select>
          {billingMode === 'usage' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={pricePerExam}
                onChange={(e) => setPricePerExam(Number(e.target.value))}
                className="h-8 w-24 text-[13px]"
              />
              <span className="text-[12px] text-muted-foreground">RON / consultație</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              doAction(
                'set_billing_mode',
                { billingMode, platformPricePerExam: pricePerExam },
                `Schimbă modul de facturare la "${billingMode}" pentru "${tenantName}"?`
              )
            }
          >
            Salvează mod facturare
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {subscription.billingMode === 'usage'
            ? `Curent: usage — ${subscription.platformPricePerExam ?? 5} RON / consultație`
            : 'Curent: flat (abonament pe planul curent)'}
        </p>
      </div>

      {/* Add note */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Adaugă o notă internă..."
          className="flex-1 h-8 rounded-md border bg-background px-2 text-[13px]"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !note.trim()}
          onClick={() => {
            doAction('add_note', { note })
            setNote('')
          }}
        >
          Salvează notă
        </Button>
      </div>
    </div>
  )
}

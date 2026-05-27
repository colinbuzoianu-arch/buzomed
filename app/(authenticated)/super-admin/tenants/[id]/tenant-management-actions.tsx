'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toastSuccess, TOAST } from '@/lib/toast'

interface Props {
  tenantId: string
  tenantName: string
  currentStatus: string
}

export function TenantManagementActions({ tenantId, tenantName, currentStatus }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function doAction(
    url: string,
    confirmMsg: string,
    body?: object,
    onSuccess?: () => void
  ) {
    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json()
      if (!res.ok) {
        TOAST.error(data.message ?? 'A apărut o eroare.')
        return
      }
      onSuccess?.()
      router.refresh()
    } catch {
      TOAST.error('Eroare de conexiune.')
    } finally {
      setBusy(false)
    }
  }

  const base = `/api/super-admin/tenants/${tenantId}`
  const isSuspended = currentStatus === 'suspended'

  return (
    <div className="rounded-lg border border-[hsl(var(--accent-danger)/0.2)] bg-[hsl(var(--accent-danger)/0.03)] p-4 space-y-3">
      <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
        Management cabinet
      </h3>

      <div className="flex flex-wrap gap-2">
        {/* Suspend / Reactivate */}
        {!isSuspended ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              doAction(
                `${base}/suspend`,
                `Suspendă contul "${tenantName}"?\n\nUtilizatorii nu vor mai putea accesa aplicația. Datele rămân intacte. Poți reactiva oricând.`,
                {},
                () => toastSuccess(`Cabinet suspendat: ${tenantName}`)
              )
            }
          >
            Suspendă contul
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              doAction(
                `${base}/reactivate`,
                `Reactivezi contul "${tenantName}"?`,
                {},
                () => toastSuccess(`Cabinet reactivat: ${tenantName}`)
              )
            }
          >
            Reactivează contul
          </Button>
        )}

        {/* Export GDPR */}
        <Button variant="outline" size="sm" asChild>
          <a href={`${base}/gdpr-export`} download>
            Export GDPR (JSON)
          </a>
        </Button>

        {/* GDPR Erase */}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            doAction(
              `${base}/gdpr-erase`,
              `ANONIMIZARE GDPR pentru "${tenantName}".\n\nAceastă acțiune înlocuiește toate datele personale ale angajaților și utilizatorilor cu [ANONIM]. Istoricul medical se păstrează.\n\nACEASTA NU POATE FI ANULATĂ. Continui?`,
              {},
              () => toastSuccess(`Date anonimizate: ${tenantName}`)
            )
          }
        >
          Anonimizare GDPR
        </Button>

        {/* Delete */}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="border-[hsl(var(--accent-danger)/0.4)] text-[hsl(var(--accent-danger))] hover:bg-[hsl(var(--accent-danger)/0.06)]"
          onClick={() =>
            doAction(
              `${base}/delete`,
              `ȘTERGERE COMPLETĂ "${tenantName}".\n\nToate datele cabinetului vor fi marcate ca șterse și nu vor mai fi vizibile.\n\nACEASTA NU POATE FI ANULATĂ. Continui?`,
              {},
              () => {
                toastSuccess(`Cabinet șters: ${tenantName}`)
                router.push('/super-admin')
              }
            )
          }
        >
          Șterge cabinet
        </Button>
      </div>

      <p className="text-[10px] text-[hsl(var(--text-faint))] leading-relaxed">
        Suspendarea blochează accesul fără să șteargă date. Anonimizarea GDPR e ireversibilă. Ștergerea completă e soft-delete — datele rămân în DB dar invizibile.
      </p>
    </div>
  )
}

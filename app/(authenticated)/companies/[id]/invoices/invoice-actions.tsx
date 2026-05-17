'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TOAST } from '@/lib/toast'

interface Props {
  companyId: string
  invoiceId: string
  status: string
  labels: {
    issue: string
    issuing: string
    issueConfirm: string
    pay: string
    paying: string
    payConfirm: string
    cancel: string
    cancelling: string
    cancelConfirm: string
    errorMessage: string
  }
}

export function InvoiceActions({ companyId, invoiceId, status, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function doAction(
    url: string,
    method: string,
    confirmMsg: string,
    toastFn: () => void
  ) {
    if (!window.confirm(confirmMsg)) return
    setBusy(true)
    try {
      const res = await fetch(url, { method })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        TOAST.error(data.message || labels.errorMessage)
        return
      }
      toastFn()
      startTransition(() => router.refresh())
    } catch {
      TOAST.error(labels.errorMessage)
    } finally {
      setBusy(false)
    }
  }

  const base = `/api/companies/${companyId}/invoices/${invoiceId}`

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === 'draft' && (
        <Button
          onClick={() =>
            doAction(`${base}/issue`, 'POST', labels.issueConfirm, () =>
              TOAST.saved()
            )
          }
          disabled={busy}
        >
          {busy ? labels.issuing : labels.issue}
        </Button>
      )}
      {(status === 'issued' || status === 'overdue') && (
        <Button
          onClick={() =>
            doAction(`${base}/pay`, 'POST', labels.payConfirm, () =>
              TOAST.saved()
            )
          }
          disabled={busy}
        >
          {busy ? labels.paying : labels.pay}
        </Button>
      )}
      {status === 'draft' && (
        <Button
          variant="outline"
          onClick={() =>
            doAction(
              base,
              'DELETE',
              labels.cancelConfirm,
              () => router.push(`/companies/${companyId}`)
            )
          }
          disabled={busy}
        >
          {busy ? labels.cancelling : labels.cancel}
        </Button>
      )}
    </div>
  )
}

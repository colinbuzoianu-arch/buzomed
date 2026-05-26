'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TOAST, toastSuccess } from '@/lib/toast'

interface Props {
  companyId: string
  invoiceId: string
  invoiceNumber: string
  status: string
  hasRecipientEmail: boolean
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
    cancelInvoice: string
    cancellingInvoice: string
    cancelInvoiceConfirm: string
    sendEmail: string
    sendingEmail: string
    sendEmailConfirm: string
    emailSent: string
    noEmailWarning: string
    errorMessage: string
  }
}

export function InvoiceActions({
  companyId,
  invoiceId,
  status,
  hasRecipientEmail,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function doAction(
    url: string,
    method: string,
    confirmMsg: string,
    onSuccess: () => void
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
      onSuccess()
      startTransition(() => router.refresh())
    } catch {
      TOAST.error(labels.errorMessage)
    } finally {
      setBusy(false)
    }
  }

  async function handleSendEmail() {
    if (!hasRecipientEmail) {
      TOAST.error(labels.noEmailWarning)
      return
    }
    if (!window.confirm(labels.sendEmailConfirm)) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/companies/${companyId}/invoices/${invoiceId}/send-email`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        TOAST.error(data.message || labels.errorMessage)
        return
      }
      toastSuccess(labels.emailSent)
    } catch {
      TOAST.error(labels.errorMessage)
    } finally {
      setBusy(false)
    }
  }

  const base = `/api/companies/${companyId}/invoices/${invoiceId}`

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Draft: Emite + Șterge */}
      {status === 'draft' && (
        <>
          <Button
            onClick={() =>
              doAction(`${base}/issue`, 'POST', labels.issueConfirm, () => TOAST.saved())
            }
            disabled={busy}
          >
            {busy ? labels.issuing : labels.issue}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              doAction(base, 'DELETE', labels.cancelConfirm, () =>
                router.push(`/companies/${companyId}`)
              )
            }
            disabled={busy}
          >
            {busy ? labels.cancelling : labels.cancel}
          </Button>
        </>
      )}

      {/* Issued / Overdue: Marchează plătită + Trimite email + Anulează */}
      {(status === 'issued' || status === 'overdue') && (
        <>
          <Button
            onClick={() =>
              doAction(`${base}/pay`, 'POST', labels.payConfirm, () => TOAST.saved())
            }
            disabled={busy}
          >
            {busy ? labels.paying : labels.pay}
          </Button>
          <Button
            variant="outline"
            onClick={handleSendEmail}
            disabled={busy}
          >
            {busy ? labels.sendingEmail : labels.sendEmail}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              doAction(`${base}/cancel`, 'POST', labels.cancelInvoiceConfirm, () => TOAST.saved())
            }
            disabled={busy}
          >
            {busy ? labels.cancellingInvoice : labels.cancelInvoice}
          </Button>
        </>
      )}
    </div>
  )
}

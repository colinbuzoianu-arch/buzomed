'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Withdrawal (retragere) control for a signed fișă de aptitudine.
 *
 * Deliberately not a one-click action and deliberately not a browser
 * `confirm()`: withdrawing a certificate is irreversible, has to carry a
 * written reason, and may name the examination that replaces it. None of
 * that fits a native confirm dialog, and a single click would be far too
 * easy to trigger by accident on a legal document.
 *
 * The replacement dropdown lists the employee's other signed examinations,
 * resolved server-side by the parent page — the component never fetches.
 */

export interface RevokeCandidate {
  id: string
  examinationNumber: string
}

interface Props {
  examinationId: string
  /** Other signed examinations for the same employee, newest first. */
  candidates: RevokeCandidate[]
  minReasonLength: number
  labels: {
    button: string
    dialogTitle: string
    dialogIntro: string
    reasonLabel: string
    reasonPlaceholder: string
    reasonTooShort: string
    supersededByLabel: string
    supersededByNone: string
    confirm: string
    cancel: string
    submitting: string
    error: string
  }
}

export function RevokeFisaDialog({ examinationId, candidates, minReasonLength, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [supersededBy, setSupersededBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonTooShort = reason.trim().length < minReasonLength

  async function submit() {
    if (reasonTooShort) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/examinations/${examinationId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: reason.trim(),
          supersededByExaminationId: supersededBy || null,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.error)
        setSubmitting(false)
        return
      }
      setOpen(false)
      setSubmitting(false)
      startTransition(() => router.refresh())
    } catch {
      setError(labels.error)
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        onClick={() => setOpen(true)}
      >
        {labels.button}
      </Button>
    )
  }

  return (
    <div className="w-full rounded-lg border border-red-300 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
      <h3 className="font-semibold text-red-900 dark:text-red-200">{labels.dialogTitle}</h3>
      <p className="mt-1 text-sm text-red-900/80 dark:text-red-200/80">{labels.dialogIntro}</p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="revocation-reason" className="block text-sm font-medium">
            {labels.reasonLabel}
          </label>
          <textarea
            id="revocation-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={labels.reasonPlaceholder}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          {reasonTooShort && reason.length > 0 && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">{labels.reasonTooShort}</p>
          )}
        </div>

        {candidates.length > 0 && (
          <div>
            <label htmlFor="superseded-by" className="block text-sm font-medium">
              {labels.supersededByLabel}
            </label>
            <select
              id="superseded-by"
              value={supersededBy}
              onChange={(e) => setSupersededBy(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">{labels.supersededByNone}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.examinationNumber}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || reasonTooShort}
            onClick={submit}
          >
            {submitting ? labels.submitting : labels.confirm}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
          >
            {labels.cancel}
          </Button>
        </div>
      </div>
    </div>
  )
}

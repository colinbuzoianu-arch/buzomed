'use client'

import { TOAST } from '@/lib/toast'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ExaminationStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'

interface Props {
  examinationId: string
  examinationNumber?: string
  currentStatus: ExaminationStatus
  verdictSet: boolean
  /** Whether the consultation date (examinedAt) has been saved. */
  examinedAtSet: boolean
  /** verdict === inapt_temporar but the "valabil până la" date is missing. */
  inaptTemporarUntilMissing: boolean
  canWriteClinical: boolean
  labels: {
    start: string
    starting: string
    cancel: string
    cancelConfirm: string
    noShow: string
    noShowConfirm: string
    sign: string
    signing: string
    signConfirm: string
    signRequirementsNotMet: string
    signNote: string
    signNoteNoSignature: string
    signTodoIntro: string
    signNeedsVerdict: string
    signNeedsExamDate: string
    signNeedsInaptUntil: string
    signBlockedStatus: string
    errorMessage: string
  }
  practitionerHasSignature: boolean
}

export function ExaminationActions({
  examinationId,
  examinationNumber,
  currentStatus,
  verdictSet,
  examinedAtSet,
  inaptTemporarUntilMissing,
  canWriteClinical,
  labels,
  practitionerHasSignature,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doAction(
    label: string,
    path: string,
    body?: Record<string, unknown>
  ) {
    setBusy(label)
    setError(null)
    try {
      const response = await fetch(`/api/examinations/${examinationId}${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setBusy(null)
        return
      }
      // Show contextual success toast per action type
      if (label === 'sign') {
        TOAST.examinationSigned(examinationNumber ?? '')
      } else if (label === 'cancel' || label === 'no_show') {
        TOAST.examinationCancelled()
      }
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('Action failed', err)
      setError(labels.errorMessage)
    } finally {
      setBusy(null)
    }
  }

  const canStart = currentStatus === 'scheduled'
  const canCancel =
    currentStatus === 'scheduled' || currentStatus === 'in_progress'

  // Everything the sign route (app/api/examinations/[id]/sign) requires before
  // it will issue the fișă, mirrored here so the greyed-out button can always
  // say exactly what is still missing instead of failing on click.
  const statusSignable =
    currentStatus === 'scheduled' ||
    currentStatus === 'in_progress' ||
    currentStatus === 'completed'
  const signTodos: string[] = []
  if (!statusSignable) {
    signTodos.push(labels.signBlockedStatus)
  } else {
    if (!verdictSet) signTodos.push(labels.signNeedsVerdict)
    if (!examinedAtSet) signTodos.push(labels.signNeedsExamDate)
    if (inaptTemporarUntilMissing) signTodos.push(labels.signNeedsInaptUntil)
  }
  const canSign = signTodos.length === 0

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        {canStart && canWriteClinical && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => doAction('start', '/start')}
            disabled={busy !== null}
          >
            {busy === 'start' ? labels.starting : labels.start}
          </Button>
        )}
        {canCancel && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(labels.cancelConfirm)) {
                  doAction('cancel', '/cancel', { reason: 'cancelled' })
                }
              }}
              disabled={busy !== null}
            >
              {labels.cancel}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(labels.noShowConfirm)) {
                  doAction('no_show', '/cancel', { reason: 'no_show' })
                }
              }}
              disabled={busy !== null}
            >
              {labels.noShow}
            </Button>
          </>
        )}
        {canWriteClinical && (
          <Button
            size="sm"
            onClick={() => {
              if (!verdictSet) {
                setError(labels.signRequirementsNotMet)
                return
              }
              if (confirm(labels.signConfirm)) {
                doAction('sign', '/sign')
              }
            }}
            disabled={busy !== null || !canSign}
          >
            {busy === 'sign' ? labels.signing : labels.sign}
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {/* Why the Semnează button is greyed out — what the user must still do. */}
      {canWriteClinical && !canSign && busy === null && signTodos.length > 0 && (
        <div className="text-right max-w-[260px]">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {labels.signTodoIntro}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {signTodos.map((todo) => (
              <li key={todo} className="text-[11px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                {todo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canWriteClinical && (
        <p className="text-[11px] text-[hsl(var(--text-faint))] text-right max-w-[260px] leading-relaxed">
          {!practitionerHasSignature
            ? labels.signNoteNoSignature
            : labels.signNote}
        </p>
      )}
    </div>
  )
}

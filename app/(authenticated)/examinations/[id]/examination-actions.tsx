'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ExaminationStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'

interface Props {
  examinationId: string
  currentStatus: ExaminationStatus
  verdictSet: boolean
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
    errorMessage: string
  }
}

export function ExaminationActions({
  examinationId,
  currentStatus,
  verdictSet,
  canWriteClinical,
  labels,
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
  const canSign =
    (currentStatus === 'scheduled' ||
      currentStatus === 'in_progress' ||
      currentStatus === 'completed') &&
    verdictSet

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
    </div>
  )
}

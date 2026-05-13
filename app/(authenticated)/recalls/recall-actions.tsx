'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  recallId: string
  employeeName: string
  practitioners: Array<{ id: string; label: string }>
  defaultPractitionerId?: string
  labels: Record<string, string>
}

type Mode = 'idle' | 'scheduling' | 'cancelling'

export function RecallActions({
  recallId,
  employeeName,
  practitioners,
  defaultPractitionerId,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Schedule form state
  const [practitionerId, setPractitionerId] = useState(
    defaultPractitionerId && practitioners.some((p) => p.id === defaultPractitionerId)
      ? defaultPractitionerId
      : ''
  )
  const [scheduledAt, setScheduledAt] = useState('')

  // Cancel form state
  const [cancelReason, setCancelReason] = useState('')

  function reset() {
    setMode('idle')
    setBusy(false)
    setError(null)
    setCancelReason('')
    setScheduledAt('')
  }

  async function handleSchedule() {
    if (!practitionerId) {
      setError(labels.errorMessage)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { practitionerId }
      if (scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString()
      }
      const response = await fetch(`/api/recalls/${recallId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setBusy(false)
        return
      }
      // The API returns the created examination; route the user there.
      const examId: string | undefined = data.examination?.id
      startTransition(() => {
        if (examId) router.push(`/examinations/${examId}`)
        else router.refresh()
      })
    } catch (err) {
      console.error('Schedule failed', err)
      setError(labels.errorMessage)
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/recalls/${recallId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          note: cancelReason.trim() || undefined,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setBusy(false)
        return
      }
      startTransition(() => {
        reset()
        router.refresh()
      })
    } catch (err) {
      console.error('Cancel failed', err)
      setError(labels.errorMessage)
      setBusy(false)
    }
  }

  if (mode === 'idle') {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Button
          size="sm"
          onClick={() => setMode('scheduling')}
          disabled={busy}
        >
          {labels.scheduleButton}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode('cancelling')}
          disabled={busy}
        >
          {labels.cancelButton}
        </Button>
      </div>
    )
  }

  if (mode === 'scheduling') {
    return (
      <div className="text-left bg-muted/30 border rounded-md p-3 space-y-3">
        <div className="text-xs font-medium">
          {labels.scheduleDialogTitle}: {employeeName}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`prac-${recallId}`} className="text-xs">
            {labels.schedulePractitioner}
          </Label>
          <select
            id={`prac-${recallId}`}
            value={practitionerId}
            onChange={(e) => setPractitionerId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            disabled={busy}
          >
            <option value="">—</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`when-${recallId}`} className="text-xs">
            {labels.scheduleAt}
          </Label>
          <Input
            id={`when-${recallId}`}
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            {labels.scheduleAtHelp}
          </p>
        </div>
        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSchedule}
            disabled={busy || !practitionerId}
          >
            {busy ? labels.scheduling : labels.submitSchedule}
          </Button>
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
            {labels.cancelDialog}
          </Button>
        </div>
      </div>
    )
  }

  // mode === 'cancelling'
  return (
    <div className="text-left bg-muted/30 border rounded-md p-3 space-y-3">
      <div className="text-xs font-medium">
        {labels.cancelDialogTitle}: {employeeName}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`reason-${recallId}`} className="text-xs">
          {labels.cancelReasonLabel}
        </Label>
        <Input
          id={`reason-${recallId}`}
          placeholder={labels.cancelReasonPlaceholder}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          disabled={busy}
        />
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={handleCancel} disabled={busy}>
          {busy ? labels.cancelling : labels.submitCancel}
        </Button>
        <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
          {labels.cancelDialog}
        </Button>
      </div>
    </div>
  )
}

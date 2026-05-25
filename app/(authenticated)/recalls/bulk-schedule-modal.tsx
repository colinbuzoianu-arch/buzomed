'use client'

import { TOAST } from '@/lib/toast'
import { formatDateAuto } from '@/lib/format-date'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export interface BulkRecall {
  id: string
  employeeName: string
  workplaceName: string
  examTypeName: string
  dueDate: string // ISO string
}

interface Props {
  recalls: BulkRecall[]
  practitioners: Array<{ id: string; label: string }>
  companyName: string
  defaultPractitionerId?: string
  labels: Record<string, string>
}

const SLOT_MINUTES = 20

export function BulkScheduleButton({
  recalls,
  practitioners,
  companyName,
  defaultPractitionerId,
  labels,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={recalls.length === 0}>
        {labels.batchButton.replace('{count}', String(recalls.length))}
      </Button>
      <BulkScheduleModal
        open={open}
        onOpenChange={setOpen}
        recalls={recalls}
        practitioners={practitioners}
        companyName={companyName}
        defaultPractitionerId={defaultPractitionerId}
        labels={labels}
      />
    </>
  )
}

function BulkScheduleModal({
  open,
  onOpenChange,
  recalls,
  practitioners,
  companyName,
  defaultPractitionerId,
  labels,
}: Props & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [practitionerId, setPractitionerId] = useState(
    defaultPractitionerId &&
      practitioners.some((p) => p.id === defaultPractitionerId)
      ? defaultPractitionerId
      : practitioners.length === 1
        ? practitioners[0].id
        : ''
  )
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Compute slot datetimes from startDate + startTime + 20-min intervals
  const slots = useMemo<Array<Date | null>>(() => {
    if (!startDate) return recalls.map(() => null)
    const baseStr = startTime
      ? `${startDate}T${startTime}:00`
      : `${startDate}T00:00:00`
    const base = new Date(baseStr)
    if (isNaN(base.getTime())) return recalls.map(() => null)
    return recalls.map((_, i) => new Date(base.getTime() + i * SLOT_MINUTES * 60_000))
  }, [recalls, startDate, startTime])

  async function handleSubmit() {
    if (!practitionerId) {
      setError(labels.batchError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/examinations/bulk-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practitionerId,
          items: recalls.map((r, i) => ({
            recallId: r.id,
            scheduledAt: slots[i]?.toISOString() ?? undefined,
          })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.message || data.error || labels.batchError)
        setBusy(false)
        return
      }
      const { summary } = data as { summary: { created: number; failed: number; total: number } }
      TOAST.batchScheduled(summary.created)
      onOpenChange(false)
      startTransition(() => router.refresh())
    } catch {
      setError(labels.batchError)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {labels.batchModalTitle.replace('{company}', companyName)}
          </DialogTitle>
          <DialogDescription>{labels.batchModalSubtitle}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{labels.batchPractitioner}</Label>
            <select
              value={practitionerId}
              onChange={(e) => setPractitionerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
            <Label>{labels.batchStartDate}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={busy}
            />
          </div>

          {startDate && (
            <div className="space-y-2">
              <Label>{labels.batchStartTime}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                {labels.batchStartTimeHelp}
              </p>
            </div>
          )}
        </div>

        {/* Preview table */}
        <div className="space-y-2">
          <div className="text-sm font-medium">{labels.batchPreviewTitle}</div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">{labels.batchColWorker}</th>
                  <th className="text-left px-3 py-2">{labels.batchColWorkplace}</th>
                  <th className="text-left px-3 py-2">{labels.batchColExamType}</th>
                  <th className="text-left px-3 py-2 whitespace-nowrap">
                    {labels.batchColTime}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recalls.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {r.employeeName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.workplaceName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.examTypeName}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                      {slots[i]
                        ? formatDateAuto(slots[i]!, 'time')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {SLOT_MINUTES} min / exam
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {labels.batchCancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || !practitionerId}
          >
            {busy
              ? labels.batchSubmitting
              : labels.batchSubmit.replace('{count}', String(recalls.length))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { EmployeeCombobox } from '@/components/employee-combobox'
import { toastSuccess } from '@/lib/toast'

export interface MergeFormLabels {
  targetLabel: string
  sourceLabel: string
  comboboxPlaceholder: string
  comboboxSearchPlaceholder: string
  comboboxNoResults: string
  comboboxTypeMore: string
  previewButton: string
  previewTitle: string
  countExaminations: string
  countVaccinations: string
  countMedicalEvents: string
  countRecalls: string
  countAssignments: string
  confirmButton: string
  confirming: string
  confirmWarning: string
  cancel: string
  errorSameEmployee: string
  errorMessage: string
  successMessage: string
}

interface PreviewResult {
  source: { id: string; firstName: string; lastName: string }
  target: { id: string; firstName: string; lastName: string }
  counts: {
    assignments: number
    examinations: number
    vaccinations: number
    medicalEvents: number
    recalls: number
  }
}

interface Props {
  labels: MergeFormLabels
}

export function MergeForm({ labels }: Props) {
  const router = useRouter()
  const [targetId, setTargetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewedFor, setPreviewedFor] = useState<{ targetId: string; sourceId: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSameEmployee = !!targetId && !!sourceId && targetId === sourceId
  const canPreview = !!targetId && !!sourceId && !isSameEmployee && !previewLoading
  const previewMatchesSelection =
    preview !== null &&
    previewedFor !== null &&
    previewedFor.targetId === targetId &&
    previewedFor.sourceId === sourceId

  function handleTargetChange(id: string) {
    setTargetId(id)
    setPreview(null)
    setError(null)
  }

  function handleSourceChange(id: string) {
    setSourceId(id)
    setPreview(null)
    setError(null)
  }

  async function handlePreview() {
    if (isSameEmployee) {
      setError(labels.errorSameEmployee)
      return
    }
    setError(null)
    setPreviewLoading(true)
    setPreview(null)
    try {
      const response = await fetch(
        `/api/employees/merge/preview?sourceId=${encodeURIComponent(sourceId)}&targetId=${encodeURIComponent(targetId)}`
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        return
      }
      setPreview(data)
      setPreviewedFor({ targetId, sourceId })
    } catch (err) {
      console.error('Merge preview failed', err)
      setError(labels.errorMessage)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirm() {
    if (!previewMatchesSelection) return
    setError(null)
    setConfirming(true)
    try {
      const response = await fetch('/api/employees/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEmployeeId: sourceId,
          targetEmployeeId: targetId,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setConfirming(false)
        return
      }
      toastSuccess(labels.successMessage)
      router.push(`/employees/${data.targetEmployeeId}`)
      router.refresh()
    } catch (err) {
      console.error('Merge confirm failed', err)
      setError(labels.errorMessage)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="mergeTarget">{labels.targetLabel}</Label>
          <EmployeeCombobox
            value={targetId}
            onChange={handleTargetChange}
            placeholder={labels.comboboxPlaceholder}
            searchPlaceholder={labels.comboboxSearchPlaceholder}
            noResultsText={labels.comboboxNoResults}
            typeMoreText={labels.comboboxTypeMore}
            disabled={confirming}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mergeSource">{labels.sourceLabel}</Label>
          <EmployeeCombobox
            value={sourceId}
            onChange={handleSourceChange}
            placeholder={labels.comboboxPlaceholder}
            searchPlaceholder={labels.comboboxSearchPlaceholder}
            noResultsText={labels.comboboxNoResults}
            typeMoreText={labels.comboboxTypeMore}
            disabled={confirming}
          />
        </div>
      </div>

      {isSameEmployee && (
        <p className="text-sm text-destructive">{labels.errorSameEmployee}</p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handlePreview}
        disabled={!canPreview}
      >
        {labels.previewButton}
      </Button>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      {previewMatchesSelection && preview && (
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold">{labels.previewTitle}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <CountBox label={labels.countExaminations} value={preview.counts.examinations} />
              <CountBox label={labels.countVaccinations} value={preview.counts.vaccinations} />
              <CountBox label={labels.countMedicalEvents} value={preview.counts.medicalEvents} />
              <CountBox label={labels.countRecalls} value={preview.counts.recalls} />
              <CountBox label={labels.countAssignments} value={preview.counts.assignments} />
            </div>
          </div>

          <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900">
            {labels.confirmWarning}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? labels.confirming : labels.confirmButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={confirming}
              onClick={() => router.push('/employees')}
            >
              {labels.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Workplace form — create + edit.
 *
 * Workplaces live under a company; the parent companyId is passed in
 * via props (not URL parsing) so this stays a dumb client component.
 *
 * Risk profile (JSONB) and required examination type IDs are NOT
 * surfaced here — they're session 6 work, when Examination Types exist.
 */

export interface WorkplaceFormValues {
  name: string
  department: string
  description: string
  examinationIntervalMonths: string // string in form, coerced to int on submit
  riskAssessmentSignedByCompany: boolean
  riskAssessmentSignedAt: string
  isActive: boolean
}

export const emptyWorkplaceFormValues: WorkplaceFormValues = {
  name: '',
  department: '',
  description: '',
  examinationIntervalMonths: '12',
  riskAssessmentSignedByCompany: false,
  riskAssessmentSignedAt: '',
  isActive: true,
}

export interface WorkplaceFormLabels {
  sectionInfo: string
  sectionRiskAssessment: string
  sectionStatus: string
  fieldName: string
  fieldNamePlaceholder: string
  fieldDepartment: string
  fieldDescription: string
  fieldExaminationInterval: string
  fieldExaminationIntervalHelp: string
  fieldRiskSigned: string
  fieldRiskSignedAt: string
  fieldIsActive: string
  required: string
  submitCreate: string
  submitUpdate: string
  submitting: string
  cancel: string
  errorMessage: string
}

interface Props {
  companyId: string
  workplaceId?: string
  initialValues?: WorkplaceFormValues
  labels: WorkplaceFormLabels
}

export function WorkplaceForm({
  companyId,
  workplaceId,
  initialValues,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<WorkplaceFormValues>(
    initialValues ?? emptyWorkplaceFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!workplaceId

  function update<K extends keyof WorkplaceFormValues>(
    key: K,
    value: WorkplaceFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const intervalNum = parseInt(form.examinationIntervalMonths, 10)
    if (
      isNaN(intervalNum) ||
      intervalNum < 1 ||
      intervalNum > 60
    ) {
      setError(labels.errorMessage)
      setSubmitting(false)
      return
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      examinationIntervalMonths: intervalNum,
      riskAssessmentSignedByCompany: form.riskAssessmentSignedByCompany,
      isActive: form.isActive,
    }

    const stringFields: Array<keyof WorkplaceFormValues> = [
      'department',
      'description',
    ]
    for (const f of stringFields) {
      const trimmed = (form[f] as string).trim()
      if (isEdit) {
        payload[f] = trimmed // '' clears
      } else if (trimmed !== '') {
        payload[f] = trimmed
      }
    }

    const signedAt = form.riskAssessmentSignedAt.trim()
    if (isEdit) {
      payload.riskAssessmentSignedAt = signedAt || null
    } else if (signedAt !== '') {
      payload.riskAssessmentSignedAt = signedAt
    }

    try {
      const url = isEdit
        ? `/api/companies/${companyId}/workplaces/${workplaceId}`
        : `/api/companies/${companyId}/workplaces`
      const method = isEdit ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }

      const newId: string | undefined = data.workplace?.id
      startTransition(() => {
        if (isEdit) {
          router.push(`/companies/${companyId}/workplaces/${workplaceId}`)
        } else if (newId) {
          router.push(`/companies/${companyId}/workplaces/${newId}`)
        } else {
          router.push(`/companies/${companyId}`)
        }
        router.refresh()
      })
    } catch (err) {
      console.error('Workplace submit failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionInfo}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">
              {labels.fieldName} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={labels.fieldNamePlaceholder}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">{labels.fieldDepartment}</Label>
            <Input
              id="department"
              value={form.department}
              onChange={(e) => update('department', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="examinationIntervalMonths">
              {labels.fieldExaminationInterval}
            </Label>
            <Input
              id="examinationIntervalMonths"
              type="number"
              min={1}
              max={60}
              value={form.examinationIntervalMonths}
              onChange={(e) =>
                update('examinationIntervalMonths', e.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldExaminationIntervalHelp}
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">{labels.fieldDescription}</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionRiskAssessment}</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.riskAssessmentSignedByCompany}
              onChange={(e) =>
                update('riskAssessmentSignedByCompany', e.target.checked)
              }
            />
            <span className="text-sm">{labels.fieldRiskSigned}</span>
          </label>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="riskAssessmentSignedAt">
              {labels.fieldRiskSignedAt}
            </Label>
            <Input
              id="riskAssessmentSignedAt"
              type="date"
              value={form.riskAssessmentSignedAt}
              onChange={(e) =>
                update('riskAssessmentSignedAt', e.target.value)
              }
              disabled={!form.riskAssessmentSignedByCompany}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionStatus}</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update('isActive', e.target.checked)}
          />
          <span className="text-sm">{labels.fieldIsActive}</span>
        </label>
      </section>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !form.name.trim()}>
          {submitting
            ? labels.submitting
            : isEdit
              ? labels.submitUpdate
              : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link
            href={
              isEdit
                ? `/companies/${companyId}/workplaces/${workplaceId}`
                : `/companies/${companyId}`
            }
          >
            {labels.cancel}
          </Link>
        </Button>
      </div>
    </form>
  )
}

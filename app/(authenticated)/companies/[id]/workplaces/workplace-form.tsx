'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RISK_PROFILE_SCHEMA,
  emptyRiskProfile,
  type RiskProfile,
  type HazardEntry,
  type HazardSeverity,
} from '@/lib/workplaces/risk-profile'
import {
  getHazardSuggestionsForCaen,
  type HazardSuggestions,
} from '@/lib/workplaces/caen-hazards'

export interface WorkplaceFormValues {
  name: string
  department: string
  description: string
  examinationIntervalMonths: string
  riskAssessmentSignedByCompany: boolean
  riskAssessmentSignedAt: string
  isActive: boolean
  riskProfile: RiskProfile
  requiredExaminationTypeIds: string[]
}

export const emptyWorkplaceFormValues: WorkplaceFormValues = {
  name: '',
  department: '',
  description: '',
  examinationIntervalMonths: '12',
  riskAssessmentSignedByCompany: false,
  riskAssessmentSignedAt: '',
  isActive: true,
  riskProfile: emptyRiskProfile(),
  requiredExaminationTypeIds: [],
}

export interface WorkplaceFormLabels {
  sectionInfo: string
  sectionRiskAssessment: string
  sectionHazardProfile: string
  sectionHazardProfileHelp: string
  sectionRequiredExamTypes: string
  sectionRequiredExamTypesHelp: string
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
  hazardCategory: Record<string, string>
  hazardName: Record<string, string>
  severityLabel: string
  severityLow: string
  severityMedium: string
  severityHigh: string
  notesPlaceholder: string
  caenSuggestionsTitle: string
  caenSuggestionsHint: string
  caenSuggestionsApply: string
  caenSuggestionsApplied: string
}

interface ExaminationType {
  id: string
  nameRo: string
  nameEn: string | null
}

interface Props {
  companyId: string
  workplaceId?: string
  initialValues?: WorkplaceFormValues
  labels: WorkplaceFormLabels
  examinationTypes: ExaminationType[]
  locale?: string
  companyCaenCode?: string | null
}

export function WorkplaceForm({
  companyId,
  workplaceId,
  initialValues,
  labels,
  examinationTypes,
  locale = 'ro',
  companyCaenCode,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<WorkplaceFormValues>(
    initialValues ?? emptyWorkplaceFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestionsApplied, setSuggestionsApplied] = useState(false)

  const caenSuggestions: HazardSuggestions | null = getHazardSuggestionsForCaen(companyCaenCode)

  const isEdit = !!workplaceId

  function update<K extends keyof WorkplaceFormValues>(
    key: K,
    value: WorkplaceFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setHazard(
    category: keyof RiskProfile,
    hazard: string,
    field: 'present' | 'severity' | 'notes',
    value: boolean | HazardSeverity | string
  ) {
    setForm((prev) => {
      const cat = { ...(prev.riskProfile[category] as Record<string, unknown>) }
      const entry = { ...(cat[hazard] as Record<string, unknown> ?? { present: false }) }
      entry[field] = value
      if (field === 'present' && !value) {
        delete entry.severity
        delete entry.notes
      }
      cat[hazard] = entry
      return {
        ...prev,
        riskProfile: { ...prev.riskProfile, [category]: cat },
      }
    })
  }

  function toggleExamType(id: string) {
    setForm((prev) => {
      const ids = prev.requiredExaminationTypeIds
      return {
        ...prev,
        requiredExaminationTypeIds: ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id],
      }
    })
  }

  function applyHazardSuggestions() {
    if (!caenSuggestions) return
    setForm((prev) => {
      const newProfile = { ...prev.riskProfile }
      for (const [cat, hazards] of Object.entries(caenSuggestions) as [keyof RiskProfile, string[]][]) {
        const catObj = { ...(newProfile[cat] as Record<string, HazardEntry>) }
        for (const hazard of hazards) {
          if (!catObj[hazard]?.present) {
            catObj[hazard] = { present: true }
          }
        }
        ;(newProfile as Record<string, unknown>)[cat] = catObj
      }
      return { ...prev, riskProfile: newProfile }
    })
    setSuggestionsApplied(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const intervalNum = parseInt(form.examinationIntervalMonths, 10)
    if (isNaN(intervalNum) || intervalNum < 1 || intervalNum > 60) {
      setError(labels.errorMessage)
      setSubmitting(false)
      return
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      examinationIntervalMonths: intervalNum,
      riskAssessmentSignedByCompany: form.riskAssessmentSignedByCompany,
      isActive: form.isActive,
      riskProfile: form.riskProfile,
      requiredExaminationTypeIds: form.requiredExaminationTypeIds,
    }

    const stringFields: Array<keyof WorkplaceFormValues> = ['department', 'description']
    for (const f of stringFields) {
      const trimmed = (form[f] as string).trim()
      if (isEdit) {
        payload[f] = trimmed
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
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
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
      {/* ── Basic info ── */}
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
              onChange={(e) => update('examinationIntervalMonths', e.target.value)}
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

      {/* ── Hazard profile ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{labels.sectionHazardProfile}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {labels.sectionHazardProfileHelp}
          </p>
        </div>

        {caenSuggestions && !suggestionsApplied && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {labels.caenSuggestionsTitle}{companyCaenCode ? ` ${companyCaenCode}` : ''}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                {labels.caenSuggestionsHint}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
              onClick={applyHazardSuggestions}
            >
              {labels.caenSuggestionsApply}
            </Button>
          </div>
        )}

        {suggestionsApplied && (
          <p className="text-xs text-muted-foreground">
            ✓ {labels.caenSuggestionsApplied}
          </p>
        )}

        <div className="space-y-6">
          {RISK_PROFILE_SCHEMA.map(({ category, hazards }) => (
            <div key={category} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b">
                <h3 className="text-sm font-semibold">
                  {labels.hazardCategory[category] ?? category}
                </h3>
              </div>
              <div className="divide-y">
                {hazards.map((hazard) => {
                  const entry = (form.riskProfile[category] as Record<string, { present: boolean; severity?: string; notes?: string }>)[hazard] ?? { present: false }
                  return (
                    <div key={hazard} className="px-4 py-3 space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={entry.present}
                          onChange={(e) =>
                            setHazard(category as keyof RiskProfile, hazard, 'present', e.target.checked)
                          }
                        />
                        <span className="text-sm font-medium">
                          {labels.hazardName[hazard] ?? hazard}
                        </span>
                      </label>
                      {entry.present && (
                        <div className="ml-6 flex flex-wrap gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              {labels.severityLabel}
                            </label>
                            <select
                              value={entry.severity ?? ''}
                              onChange={(e) =>
                                setHazard(
                                  category as keyof RiskProfile,
                                  hazard,
                                  'severity',
                                  e.target.value as HazardSeverity
                                )
                              }
                              className="text-sm border rounded-md px-2 py-1 bg-background"
                            >
                              <option value="">—</option>
                              <option value="low">{labels.severityLow}</option>
                              <option value="medium">{labels.severityMedium}</option>
                              <option value="high">{labels.severityHigh}</option>
                            </select>
                          </div>
                          <div className="flex-1 min-w-[160px] space-y-1">
                            <label className="text-xs text-muted-foreground">
                              {labels.notesPlaceholder}
                            </label>
                            <Input
                              value={entry.notes ?? ''}
                              onChange={(e) =>
                                setHazard(
                                  category as keyof RiskProfile,
                                  hazard,
                                  'notes',
                                  e.target.value
                                )
                              }
                              placeholder={labels.notesPlaceholder}
                              className="text-sm h-8"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Required examination types ── */}
      {examinationTypes.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{labels.sectionRequiredExamTypes}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {labels.sectionRequiredExamTypesHelp}
            </p>
          </div>
          <div className="border rounded-lg divide-y">
            {examinationTypes.map((et) => (
              <label key={et.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={form.requiredExaminationTypeIds.includes(et.id)}
                  onChange={() => toggleExamType(et.id)}
                />
                <span className="text-sm">
                  {locale === 'en' ? (et.nameEn || et.nameRo) : et.nameRo}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ── Risk assessment ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionRiskAssessment}</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.riskAssessmentSignedByCompany}
              onChange={(e) => update('riskAssessmentSignedByCompany', e.target.checked)}
            />
            <span className="text-sm">{labels.fieldRiskSigned}</span>
          </label>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="riskAssessmentSignedAt">{labels.fieldRiskSignedAt}</Label>
            <Input
              id="riskAssessmentSignedAt"
              type="date"
              value={form.riskAssessmentSignedAt}
              onChange={(e) => update('riskAssessmentSignedAt', e.target.value)}
              disabled={!form.riskAssessmentSignedByCompany}
            />
          </div>
        </div>
      </section>

      {/* ── Status ── */}
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

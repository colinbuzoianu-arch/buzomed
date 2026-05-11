'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ExaminationVerdict } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Examination clinical form.
 *
 * Big shape, simple architecture. All structured fields live as keys
 * within JSONB objects (anamnesis, vitalSigns, etc.) that we send as
 * full objects on save — we don't reach into the JSONB; the client
 * owns the structure and the server stores it.
 *
 * Free-text "additional notes" fields per section give practitioners a
 * place to capture anything the structured fields don't cover (per Q2).
 *
 * The form is locked when:
 *   - exam is signed (read-only, all inputs disabled)
 *   - exam is cancelled / no_show (also read-only)
 */

export interface ExaminationFormValues {
  anamnesis: Record<string, unknown>
  vitalSigns: Record<string, unknown>
  visionTest: Record<string, unknown>
  hearingTest: Record<string, unknown>
  lungFunction: Record<string, unknown>
  additionalTests: Record<string, unknown>
  diagnoses: string[]
  clinicalFindings: string
  recommendations: string
  notes: string
  verdict: ExaminationVerdict | null
  verdictConditions: string
  inaptTemporarUntil: string
  nextExaminationDueDate: string
}

interface Labels {
  sectionAnamnesis: string
  sectionVitalSigns: string
  sectionVision: string
  sectionHearing: string
  sectionLung: string
  sectionAdditional: string
  sectionFindings: string
  sectionVerdict: string
  fieldGeneralHistory: string
  fieldChronicConditions: string
  fieldMedications: string
  fieldAllergies: string
  fieldFamilyHistory: string
  fieldOccupationalHistory: string
  fieldAdditionalNotes: string
  fieldHeight: string
  fieldWeight: string
  fieldBmi: string
  fieldBpSystolic: string
  fieldBpDiastolic: string
  fieldPulse: string
  fieldVisionLeft: string
  fieldVisionRight: string
  fieldVisionWithCorrection: string
  fieldVisionColor: string
  fieldHearingLeft: string
  fieldHearingRight: string
  fieldLungFev1: string
  fieldLungFvc: string
  fieldLungRatio: string
  fieldAdditionalLab: string
  fieldAdditionalImaging: string
  fieldAdditionalOther: string
  fieldClinicalFindings: string
  fieldDiagnoses: string
  fieldDiagnosesHelp: string
  fieldRecommendations: string
  fieldNotes: string
  fieldVerdict: string
  fieldVerdictApt: string
  fieldVerdictAptConditionat: string
  fieldVerdictInaptTemporar: string
  fieldVerdictInapt: string
  fieldVerdictConditions: string
  fieldInaptTemporarUntil: string
  fieldNextDueDate: string
  fieldNextDueDateHelp: string
  saveButton: string
  saving: string
  savedToast: string
  signedNotice: string
  errorMessage: string
}

interface Props {
  examinationId: string
  locked: boolean
  signed: boolean
  initialValues: ExaminationFormValues
  defaultIntervalMonths: number
  labels: Labels
}

// Helpers for read/write of named keys in JSONB sub-objects without
// punching through TS's structural typing every line.
function getStr(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}
function getNum(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

export function ExaminationForm({
  examinationId,
  locked,
  signed,
  initialValues,
  defaultIntervalMonths,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [values, setValues] = useState<ExaminationFormValues>(initialValues)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Update helpers — keep the JSONB shape immutable per update.
  function updateJson<K extends keyof ExaminationFormValues>(
    bucket: K,
    key: string,
    value: unknown
  ) {
    setValues((prev) => {
      const current = prev[bucket] as unknown
      if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
        return {
          ...prev,
          [bucket]: { ...(current as Record<string, unknown>), [key]: value },
        }
      }
      return prev
    })
  }
  function updateTop<K extends keyof ExaminationFormValues>(
    key: K,
    value: ExaminationFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // BMI auto-calculation when both height + weight are present.
  const bmi = useMemo(() => {
    const h = parseFloat(getStr(values.vitalSigns, 'height'))
    const w = parseFloat(getStr(values.vitalSigns, 'weight'))
    if (!h || !w || h <= 0) return ''
    const meters = h > 3 ? h / 100 : h
    const v = w / (meters * meters)
    return v.toFixed(1)
  }, [values.vitalSigns])

  async function handleSave() {
    if (locked) return
    setSaving(true)
    setError(null)
    setSavedAt(null)

    // Numeric strings → numbers in JSONB. Empty stays empty (omitted).
    const numericVitalKeys = [
      'height',
      'weight',
      'bpSystolic',
      'bpDiastolic',
      'pulse',
    ] as const
    const numericLungKeys = ['fev1', 'fvc', 'ratio'] as const

    function normalizeNumeric(
      o: Record<string, unknown>,
      keys: readonly string[]
    ): Record<string, unknown> {
      const out: Record<string, unknown> = { ...o }
      for (const k of keys) {
        const v = out[k]
        if (v === '' || v === null || v === undefined) {
          delete out[k]
        } else if (typeof v === 'string') {
          const n = parseFloat(v)
          if (!isNaN(n)) out[k] = n
        }
      }
      return out
    }

    const payload: Record<string, unknown> = {
      anamnesis: values.anamnesis,
      vitalSigns: {
        ...normalizeNumeric(values.vitalSigns, numericVitalKeys),
        ...(bmi ? { bmi: parseFloat(bmi) } : {}),
      },
      visionTest: values.visionTest,
      hearingTest: values.hearingTest,
      lungFunction: normalizeNumeric(values.lungFunction, numericLungKeys),
      additionalTests: values.additionalTests,
      diagnoses: values.diagnoses,
      clinicalFindings: values.clinicalFindings,
      recommendations: values.recommendations,
      notes: values.notes,
      verdict: values.verdict ?? null,
      verdictConditions: values.verdictConditions,
      inaptTemporarUntil: values.inaptTemporarUntil || null,
      nextExaminationDueDate: values.nextExaminationDueDate || null,
    }

    try {
      const response = await fetch(`/api/examinations/${examinationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setSaving(false)
        return
      }
      setSavedAt(Date.now())
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Save failed', err)
      setError(labels.errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Auto-clear the saved toast after a few seconds.
  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 3000)
    return () => clearTimeout(t)
  }, [savedAt])

  const ro = locked // shorthand for readonly

  return (
    <div className="space-y-8">
      {signed && (
        <div className="border border-green-300 bg-green-50 text-green-900 rounded-md px-4 py-3 text-sm">
          {labels.signedNotice}
        </div>
      )}

      {/* Anamnesis */}
      <FormSection title={labels.sectionAnamnesis}>
        <FullWidth>
          <Field
            label={labels.fieldGeneralHistory}
            value={getStr(values.anamnesis, 'general')}
            onChange={(v) => updateJson('anamnesis', 'general', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <Field
          label={labels.fieldChronicConditions}
          value={getStr(values.anamnesis, 'chronicConditions')}
          onChange={(v) => updateJson('anamnesis', 'chronicConditions', v)}
          multiline
          disabled={ro}
        />
        <Field
          label={labels.fieldMedications}
          value={getStr(values.anamnesis, 'medications')}
          onChange={(v) => updateJson('anamnesis', 'medications', v)}
          multiline
          disabled={ro}
        />
        <Field
          label={labels.fieldAllergies}
          value={getStr(values.anamnesis, 'allergies')}
          onChange={(v) => updateJson('anamnesis', 'allergies', v)}
          multiline
          disabled={ro}
        />
        <Field
          label={labels.fieldFamilyHistory}
          value={getStr(values.anamnesis, 'familyHistory')}
          onChange={(v) => updateJson('anamnesis', 'familyHistory', v)}
          multiline
          disabled={ro}
        />
        <FullWidth>
          <Field
            label={labels.fieldOccupationalHistory}
            value={getStr(values.anamnesis, 'occupationalHistory')}
            onChange={(v) => updateJson('anamnesis', 'occupationalHistory', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <Field
            label={labels.fieldAdditionalNotes}
            value={getStr(values.anamnesis, 'additionalNotes')}
            onChange={(v) => updateJson('anamnesis', 'additionalNotes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Vital signs */}
      <FormSection title={labels.sectionVitalSigns}>
        <Field
          label={labels.fieldHeight}
          value={getNum(values.vitalSigns, 'height')}
          onChange={(v) => updateJson('vitalSigns', 'height', v)}
          type="number"
          step="0.1"
          disabled={ro}
        />
        <Field
          label={labels.fieldWeight}
          value={getNum(values.vitalSigns, 'weight')}
          onChange={(v) => updateJson('vitalSigns', 'weight', v)}
          type="number"
          step="0.1"
          disabled={ro}
        />
        <Field
          label={labels.fieldBmi}
          value={bmi}
          onChange={() => {}}
          disabled
          type="number"
        />
        <Field
          label={labels.fieldBpSystolic}
          value={getNum(values.vitalSigns, 'bpSystolic')}
          onChange={(v) => updateJson('vitalSigns', 'bpSystolic', v)}
          type="number"
          disabled={ro}
        />
        <Field
          label={labels.fieldBpDiastolic}
          value={getNum(values.vitalSigns, 'bpDiastolic')}
          onChange={(v) => updateJson('vitalSigns', 'bpDiastolic', v)}
          type="number"
          disabled={ro}
        />
        <Field
          label={labels.fieldPulse}
          value={getNum(values.vitalSigns, 'pulse')}
          onChange={(v) => updateJson('vitalSigns', 'pulse', v)}
          type="number"
          disabled={ro}
        />
        <FullWidth>
          <Field
            label={labels.fieldAdditionalNotes}
            value={getStr(values.vitalSigns, 'additionalNotes')}
            onChange={(v) => updateJson('vitalSigns', 'additionalNotes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Vision */}
      <FormSection title={labels.sectionVision}>
        <Field
          label={labels.fieldVisionLeft}
          value={getStr(values.visionTest, 'left')}
          onChange={(v) => updateJson('visionTest', 'left', v)}
          disabled={ro}
        />
        <Field
          label={labels.fieldVisionRight}
          value={getStr(values.visionTest, 'right')}
          onChange={(v) => updateJson('visionTest', 'right', v)}
          disabled={ro}
        />
        <FullWidth>
          <CheckField
            label={labels.fieldVisionWithCorrection}
            checked={Boolean(values.visionTest.withCorrection)}
            onChange={(v) => updateJson('visionTest', 'withCorrection', v)}
            disabled={ro}
          />
        </FullWidth>
        <Field
          label={labels.fieldVisionColor}
          value={getStr(values.visionTest, 'colorPerception')}
          onChange={(v) => updateJson('visionTest', 'colorPerception', v)}
          disabled={ro}
        />
        <FullWidth>
          <Field
            label={labels.fieldAdditionalNotes}
            value={getStr(values.visionTest, 'additionalNotes')}
            onChange={(v) => updateJson('visionTest', 'additionalNotes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Hearing */}
      <FormSection title={labels.sectionHearing}>
        <Field
          label={labels.fieldHearingLeft}
          value={getStr(values.hearingTest, 'left')}
          onChange={(v) => updateJson('hearingTest', 'left', v)}
          disabled={ro}
        />
        <Field
          label={labels.fieldHearingRight}
          value={getStr(values.hearingTest, 'right')}
          onChange={(v) => updateJson('hearingTest', 'right', v)}
          disabled={ro}
        />
        <FullWidth>
          <Field
            label={labels.fieldAdditionalNotes}
            value={getStr(values.hearingTest, 'additionalNotes')}
            onChange={(v) => updateJson('hearingTest', 'additionalNotes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Lung function */}
      <FormSection title={labels.sectionLung}>
        <Field
          label={labels.fieldLungFev1}
          value={getNum(values.lungFunction, 'fev1')}
          onChange={(v) => updateJson('lungFunction', 'fev1', v)}
          type="number"
          step="0.01"
          disabled={ro}
        />
        <Field
          label={labels.fieldLungFvc}
          value={getNum(values.lungFunction, 'fvc')}
          onChange={(v) => updateJson('lungFunction', 'fvc', v)}
          type="number"
          step="0.01"
          disabled={ro}
        />
        <Field
          label={labels.fieldLungRatio}
          value={getNum(values.lungFunction, 'ratio')}
          onChange={(v) => updateJson('lungFunction', 'ratio', v)}
          type="number"
          step="0.01"
          disabled={ro}
        />
        <FullWidth>
          <Field
            label={labels.fieldAdditionalNotes}
            value={getStr(values.lungFunction, 'additionalNotes')}
            onChange={(v) => updateJson('lungFunction', 'additionalNotes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Additional tests */}
      <FormSection title={labels.sectionAdditional}>
        <FullWidth>
          <Field
            label={labels.fieldAdditionalLab}
            value={getStr(values.additionalTests, 'laboratory')}
            onChange={(v) => updateJson('additionalTests', 'laboratory', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <Field
            label={labels.fieldAdditionalImaging}
            value={getStr(values.additionalTests, 'imaging')}
            onChange={(v) => updateJson('additionalTests', 'imaging', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <Field
            label={labels.fieldAdditionalOther}
            value={getStr(values.additionalTests, 'other')}
            onChange={(v) => updateJson('additionalTests', 'other', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Findings */}
      <FormSection title={labels.sectionFindings}>
        <FullWidth>
          <Field
            label={labels.fieldClinicalFindings}
            value={values.clinicalFindings}
            onChange={(v) => updateTop('clinicalFindings', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <DiagnosesField
            label={labels.fieldDiagnoses}
            help={labels.fieldDiagnosesHelp}
            value={values.diagnoses}
            onChange={(v) => updateTop('diagnoses', v)}
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <Field
            label={labels.fieldRecommendations}
            value={values.recommendations}
            onChange={(v) => updateTop('recommendations', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
        <FullWidth>
          <Field
            label={labels.fieldNotes}
            value={values.notes}
            onChange={(v) => updateTop('notes', v)}
            multiline
            disabled={ro}
          />
        </FullWidth>
      </FormSection>

      {/* Verdict */}
      <FormSection title={labels.sectionVerdict}>
        <FullWidth>
          <div className="space-y-2">
            <Label>{labels.fieldVerdict}</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const).map(
                (v) => (
                  <label
                    key={v}
                    className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer ${
                      values.verdict === v
                        ? 'border-primary bg-primary/5'
                        : 'border-input'
                    } ${ro ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name="verdict"
                      value={v}
                      checked={values.verdict === v}
                      onChange={() => updateTop('verdict', v)}
                      disabled={ro}
                    />
                    <span>
                      {v === 'apt' && labels.fieldVerdictApt}
                      {v === 'apt_conditionat' &&
                        labels.fieldVerdictAptConditionat}
                      {v === 'inapt_temporar' &&
                        labels.fieldVerdictInaptTemporar}
                      {v === 'inapt' && labels.fieldVerdictInapt}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>
        </FullWidth>
        {(values.verdict === 'apt_conditionat' ||
          values.verdict === 'inapt_temporar' ||
          values.verdict === 'inapt') && (
          <FullWidth>
            <Field
              label={labels.fieldVerdictConditions}
              value={values.verdictConditions}
              onChange={(v) => updateTop('verdictConditions', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
        )}
        {values.verdict === 'inapt_temporar' && (
          <Field
            label={labels.fieldInaptTemporarUntil}
            value={values.inaptTemporarUntil}
            onChange={(v) => updateTop('inaptTemporarUntil', v)}
            type="date"
            disabled={ro}
          />
        )}
        {(values.verdict === 'apt' || values.verdict === 'apt_conditionat') && (
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="nextDue">{labels.fieldNextDueDate}</Label>
            <Input
              id="nextDue"
              type="date"
              value={values.nextExaminationDueDate}
              onChange={(e) =>
                updateTop('nextExaminationDueDate', e.target.value)
              }
              disabled={ro}
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldNextDueDateHelp.replace(
                '{months}',
                String(defaultIntervalMonths)
              )}
            </p>
          </div>
        )}
      </FormSection>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      {!ro && (
        <div className="flex items-center gap-3 sticky bottom-4 bg-background border rounded-md p-3 shadow-sm">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? labels.saving : labels.saveButton}
          </Button>
          {savedAt && (
            <span className="text-xs text-green-700">{labels.savedToast}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── helper subcomponents ───────────────────────────────────────────

function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  )
}

function FullWidth({ children }: { children: React.ReactNode }) {
  return <div className="md:col-span-2">{children}</div>
}

function Field({
  label,
  value,
  onChange,
  multiline,
  type = 'text',
  step,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  type?: string
  step?: string
  disabled?: boolean
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      ) : (
        <Input
          id={id}
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function CheckField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  )
}

function DiagnosesField({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string
  help: string
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  // Stored as array of strings — entered as a textarea with one per line
  // for simplicity. ICD-10 picker is a future enhancement.
  const [text, setText] = useState(value.join('\n'))
  function commit() {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    onChange(lines)
  }
  useEffect(() => {
    setText(value.join('\n'))
  }, [value])
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        disabled={disabled}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  )
}

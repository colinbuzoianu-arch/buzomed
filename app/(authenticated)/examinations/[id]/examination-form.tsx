'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ExaminationVerdict } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSectionsForExamType } from '@/lib/examinations/document-templates'
import { useExaminationPrefill } from '@/hooks/useExaminationPrefill'

/**
 * Examination clinical form.
 *
 * All structured fields live as keys within JSONB objects (anamnesis,
 * vitalSigns, etc.) that we send as full objects on save — the client owns
 * the structure.
 *
 * Section visibility is driven by getSectionsForExamType(examinationTypeCode),
 * which maps each exam type to a set of boolean flags. New exam types
 * (protectia_maternitatii, certificat_*) add their own sections without
 * changing the existing sections for angajare / control_periodic.
 *
 * The form is locked when exam is signed, cancelled, or no_show.
 */

// ─── Maternity risk checklist (OUG 96/2003 Annex 1) ────────────────────────
const MATERNITY_RISK_FACTORS: Array<{
  categoryKey: string
  items: string[]
}> = [
  {
    categoryKey: 'categoryPhysical',
    items: [
      'socuri',
      'manipulareGreutati',
      'zgomot',
      'radiatiiIonizante',
      'radiatiiNeionizante',
      'temperatureExtreme',
      'posturiFortat',
      'ortostatism',
    ],
  },
  {
    categoryKey: 'categoryBiological',
    items: ['rubeola', 'toxoplasma', 'hepatitaB', 'bacteriiCongenitale'],
  },
  {
    categoryKey: 'categoryChemical',
    items: [
      'substanteR40',
      'substanteR61',
      'mercur',
      'citostatice',
      'monoxidCarbon',
      'plumb',
    ],
  },
  {
    categoryKey: 'categoryWorkConditions',
    items: ['actSubterana', 'lucruNocturn'],
  },
]

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExaminationFormValues {
  anamnesis: Record<string, unknown>
  vitalSigns: Record<string, unknown>
  visionTest: Record<string, unknown>
  hearingTest: Record<string, unknown>
  lungFunction: Record<string, unknown>
  additionalTests: Record<string, unknown>
  maternityRisk: Record<string, unknown>
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
  // Initial intake (Dosar Medical)
  sectionInitialIntake: string
  fieldIntakeRutaProfesionala: string
  fieldIntakeMedicFamilie: string
  fieldIntakeFumat: string
  fieldIntakeAlcool: string
  fieldIntakeCafea: string
  fieldIntakeDroguri: string
  fieldIntakeEnergizant: string
  fieldIntakeAlergii: string
  fieldIntakeSportPerformanta: string
  fieldIntakeTratamenteUrmate: string
  fieldIntakeBoliProfesionale: string
  fieldIntakeBoliProfesionaleDiagnostic: string
  fieldIntakeAccidenteMunca: string
  fieldIntakeAccidenteMuncaDiagnostic: string
  fieldIntakeStagiuMilitar: string
  optYes: string
  optNo: string
  optOccasional: string
  // Maternity risk
  sectionMaternityRisk: string
  // Certificate section
  sectionCertificate: string
  certApt: string
  certInapt: string
  certAptConditionat: string
  certInaptTemporar: string
  // AI prefill
  prefillLoading: string
  prefillReady: string
  prefillApply: string
  prefillIgnore: string
  prefillTooltip: string
}

interface Props {
  examinationId: string
  examinationTypeCode: string
  locked: boolean
  signed: boolean
  initialValues: ExaminationFormValues
  defaultIntervalMonths: number
  labels: Labels
  hazardHintLabels?: Record<string, string>
  /** Labels for maternity risk factor keys + category headers */
  maternityRiskLabels?: Record<string, string>
  prefillEnabled: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStr(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}
function getNum(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ExaminationForm({
  examinationId,
  examinationTypeCode,
  locked,
  signed,
  initialValues,
  defaultIntervalMonths,
  labels,
  hazardHintLabels,
  maternityRiskLabels,
  prefillEnabled,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [values, setValues] = useState<ExaminationFormValues>(initialValues)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefillApplied, setPrefillApplied] = useState(false)
  const [prefillDismissed, setPrefillDismissed] = useState(false)
  const [prefillHighlighted, setPrefillHighlighted] = useState<
    Map<string, 'med' | 'low'>
  >(new Map())

  const sections = getSectionsForExamType(examinationTypeCode)
  const { suggestions, status: prefillStatus } = useExaminationPrefill(
    examinationId,
    prefillEnabled
  )
  const prefillCount = Object.keys(suggestions).length
  const showPrefillBanner =
    prefillEnabled &&
    !prefillDismissed &&
    (prefillStatus === 'loading' ||
      (prefillStatus === 'done' && !prefillApplied && prefillCount > 0))

  // Update helpers — keeps JSONB shape immutable per update and clears prefill highlights
  function updateJson<K extends keyof ExaminationFormValues>(
    bucket: K,
    key: string,
    value: unknown
  ) {
    setValues((prev) => {
      const current = prev[bucket] as unknown
      if (
        typeof current === 'object' &&
        current !== null &&
        !Array.isArray(current)
      ) {
        return {
          ...prev,
          [bucket]: { ...(current as Record<string, unknown>), [key]: value },
        }
      }
      return prev
    })
    const dotKey = `${String(bucket)}.${key}`
    setPrefillHighlighted((prev) => {
      if (!prev.has(dotKey)) return prev
      const next = new Map(prev)
      next.delete(dotKey)
      return next
    })
  }

  function updateTop<K extends keyof ExaminationFormValues>(
    key: K,
    value: ExaminationFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // BMI auto-calculation
  const bmi = useMemo(() => {
    const h = parseFloat(getStr(values.vitalSigns, 'height'))
    const w = parseFloat(getStr(values.vitalSigns, 'weight'))
    if (!h || !w || h <= 0) return ''
    const meters = h > 3 ? h / 100 : h
    return (w / (meters * meters)).toFixed(1)
  }, [values.vitalSigns])

  // Apply AI prefill suggestions into form state
  function handleApplyPrefill() {
    const nextValues = { ...values }
    const newHighlighted = new Map<string, 'med' | 'low'>()

    for (const [dotKey, suggestion] of Object.entries(suggestions)) {
      const dotIdx = dotKey.indexOf('.')
      if (dotIdx === -1) continue
      const bucket = dotKey.slice(0, dotIdx) as keyof ExaminationFormValues
      const field = dotKey.slice(dotIdx + 1)
      const currentBucket = nextValues[bucket]
      if (
        typeof currentBucket === 'object' &&
        currentBucket !== null &&
        !Array.isArray(currentBucket)
      ) {
        ;(nextValues as Record<string, unknown>)[bucket] = {
          ...(currentBucket as Record<string, unknown>),
          [field]: suggestion.value,
        }
      }
      if (suggestion.confidence !== 'high') {
        newHighlighted.set(dotKey, suggestion.confidence)
      }
    }

    setValues(nextValues)
    setPrefillHighlighted(newHighlighted)
    setPrefillApplied(true)
  }

  async function handleSave() {
    if (locked) return
    setSaving(true)
    setError(null)
    setSavedAt(null)

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

    // Append AI pre-fill audit tag to notes on first save after applying
    const notesValue = prefillApplied
      ? [values.notes, '[AI pre-fill aplicat]'].filter(Boolean).join('\n')
      : values.notes

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
      maternityRisk: values.maternityRisk,
      diagnoses: values.diagnoses,
      clinicalFindings: values.clinicalFindings,
      recommendations: values.recommendations,
      notes: notesValue,
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
      if (prefillApplied) setPrefillApplied(false)
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

  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 3000)
    return () => clearTimeout(t)
  }, [savedAt])

  const ro = locked

  function isHighlighted(bucket: string, key: string): boolean {
    return prefillHighlighted.has(`${bucket}.${key}`)
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {signed && (
        <div className="border border-green-300 bg-green-50 text-green-900 rounded-md px-4 py-3 text-sm">
          {labels.signedNotice}
        </div>
      )}

      {/* AI prefill banner */}
      {showPrefillBanner && (
        <div className="flex items-center justify-between gap-4 border border-blue-200 bg-blue-50 text-blue-900 rounded-md px-4 py-3 text-sm">
          {prefillStatus === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full" />
              {labels.prefillLoading}
            </span>
          ) : (
            <>
              <span>
                {labels.prefillReady.replace('{count}', String(prefillCount))}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyPrefill}
                >
                  {labels.prefillApply}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPrefillDismissed(true)}
                >
                  {labels.prefillIgnore}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Anamnesis ─────────────────────────────────────────────────────── */}
      {sections.showAnamnesis && (
        <FormSection title={labels.sectionAnamnesis}>
          <FullWidth>
            <Field
              label={labels.fieldGeneralHistory}
              value={getStr(values.anamnesis, 'general')}
              onChange={(v) => updateJson('anamnesis', 'general', v)}
              multiline
              disabled={ro}
              highlighted={isHighlighted('anamnesis', 'general')}
              highlightTooltip={labels.prefillTooltip}
            />
          </FullWidth>
          <Field
            label={labels.fieldChronicConditions}
            value={getStr(values.anamnesis, 'chronicConditions')}
            onChange={(v) => updateJson('anamnesis', 'chronicConditions', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'chronicConditions')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldMedications}
            value={getStr(values.anamnesis, 'medications')}
            onChange={(v) => updateJson('anamnesis', 'medications', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'medications')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldAllergies}
            value={getStr(values.anamnesis, 'allergies')}
            onChange={(v) => updateJson('anamnesis', 'allergies', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'allergies')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldFamilyHistory}
            value={getStr(values.anamnesis, 'familyHistory')}
            onChange={(v) => updateJson('anamnesis', 'familyHistory', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'familyHistory')}
            highlightTooltip={labels.prefillTooltip}
          />
          <FullWidth>
            <Field
              label={labels.fieldOccupationalHistory}
              value={getStr(values.anamnesis, 'occupationalHistory')}
              onChange={(v) => updateJson('anamnesis', 'occupationalHistory', v)}
              multiline
              disabled={ro}
              highlighted={isHighlighted('anamnesis', 'occupationalHistory')}
              highlightTooltip={labels.prefillTooltip}
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
      )}

      {/* ── Initial Intake — Dosar Medical (angajare only) ────────────────── */}
      {sections.showInitialIntake && (
        <FormSection title={labels.sectionInitialIntake}>
          <FullWidth>
            <Field
              label={labels.fieldIntakeRutaProfesionala}
              value={getStr(values.anamnesis, 'intake_ruta_profesionala')}
              onChange={(v) =>
                updateJson('anamnesis', 'intake_ruta_profesionala', v)
              }
              multiline
              disabled={ro}
            />
          </FullWidth>
          <Field
            label={labels.fieldIntakeMedicFamilie}
            value={getStr(values.anamnesis, 'intake_medic_familie')}
            onChange={(v) => updateJson('anamnesis', 'intake_medic_familie', v)}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeFumat}
            value={getStr(values.anamnesis, 'intake_fumat')}
            onChange={(v) => updateJson('anamnesis', 'intake_fumat', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeAlcool}
            value={getStr(values.anamnesis, 'intake_alcool')}
            onChange={(v) => updateJson('anamnesis', 'intake_alcool', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeCafea}
            value={getStr(values.anamnesis, 'intake_cafea')}
            onChange={(v) => updateJson('anamnesis', 'intake_cafea', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeDroguri}
            value={getStr(values.anamnesis, 'intake_droguri')}
            onChange={(v) => updateJson('anamnesis', 'intake_droguri', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeEnergizant}
            value={getStr(values.anamnesis, 'intake_energizant')}
            onChange={(v) => updateJson('anamnesis', 'intake_energizant', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <FullWidth>
            <Field
              label={labels.fieldIntakeAlergii}
              value={getStr(values.anamnesis, 'intake_alergii')}
              onChange={(v) => updateJson('anamnesis', 'intake_alergii', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          <SelectField
            label={labels.fieldIntakeSportPerformanta}
            value={getStr(values.anamnesis, 'intake_sport_performanta')}
            onChange={(v) =>
              updateJson('anamnesis', 'intake_sport_performanta', v)
            }
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
          <FullWidth>
            <Field
              label={labels.fieldIntakeTratamenteUrmate}
              value={getStr(values.anamnesis, 'intake_tratamente_urmate')}
              onChange={(v) =>
                updateJson('anamnesis', 'intake_tratamente_urmate', v)
              }
              multiline
              disabled={ro}
            />
          </FullWidth>
          {/* Boli profesionale */}
          <FullWidth>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                label={labels.fieldIntakeBoliProfesionale}
                value={getStr(values.anamnesis, 'intake_boli_profesionale')}
                onChange={(v) =>
                  updateJson('anamnesis', 'intake_boli_profesionale', v)
                }
                options={[
                  { value: '', label: '—' },
                  { value: 'nu', label: labels.optNo },
                  { value: 'da', label: labels.optYes },
                ]}
                disabled={ro}
              />
              {getStr(values.anamnesis, 'intake_boli_profesionale') === 'da' && (
                <Field
                  label={labels.fieldIntakeBoliProfesionaleDiagnostic}
                  value={getStr(
                    values.anamnesis,
                    'intake_boli_profesionale_diagnostic'
                  )}
                  onChange={(v) =>
                    updateJson(
                      'anamnesis',
                      'intake_boli_profesionale_diagnostic',
                      v
                    )
                  }
                  disabled={ro}
                />
              )}
            </div>
          </FullWidth>
          {/* Accidente de muncă */}
          <FullWidth>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                label={labels.fieldIntakeAccidenteMunca}
                value={getStr(values.anamnesis, 'intake_accidente_munca')}
                onChange={(v) =>
                  updateJson('anamnesis', 'intake_accidente_munca', v)
                }
                options={[
                  { value: '', label: '—' },
                  { value: 'nu', label: labels.optNo },
                  { value: 'da', label: labels.optYes },
                ]}
                disabled={ro}
              />
              {getStr(values.anamnesis, 'intake_accidente_munca') === 'da' && (
                <Field
                  label={labels.fieldIntakeAccidenteMuncaDiagnostic}
                  value={getStr(
                    values.anamnesis,
                    'intake_accidente_munca_diagnostic'
                  )}
                  onChange={(v) =>
                    updateJson(
                      'anamnesis',
                      'intake_accidente_munca_diagnostic',
                      v
                    )
                  }
                  disabled={ro}
                />
              )}
            </div>
          </FullWidth>
          <SelectField
            label={labels.fieldIntakeStagiuMilitar}
            value={getStr(values.anamnesis, 'intake_stagiu_militar')}
            onChange={(v) =>
              updateJson('anamnesis', 'intake_stagiu_militar', v)
            }
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
        </FormSection>
      )}

      {/* ── Vital signs ───────────────────────────────────────────────────── */}
      {sections.showVitalSigns && (
        <FormSection title={labels.sectionVitalSigns}>
          <Field
            label={labels.fieldHeight}
            value={getNum(values.vitalSigns, 'height')}
            onChange={(v) => updateJson('vitalSigns', 'height', v)}
            type="number"
            step="0.1"
            disabled={ro}
            highlighted={isHighlighted('vitalSigns', 'height')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldWeight}
            value={getNum(values.vitalSigns, 'weight')}
            onChange={(v) => updateJson('vitalSigns', 'weight', v)}
            type="number"
            step="0.1"
            disabled={ro}
            highlighted={isHighlighted('vitalSigns', 'weight')}
            highlightTooltip={labels.prefillTooltip}
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
      )}

      {/* ── Vision ────────────────────────────────────────────────────────── */}
      {sections.showVision && (
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
      )}

      {/* ── Hearing ───────────────────────────────────────────────────────── */}
      {sections.showHearing && (
        <FormSection
          title={labels.sectionHearing}
          hazardHint={hazardHintLabels?.['hearing']}
        >
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
      )}

      {/* ── Lung function ─────────────────────────────────────────────────── */}
      {sections.showLung && (
        <FormSection
          title={labels.sectionLung}
          hazardHint={hazardHintLabels?.['lung']}
        >
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
      )}

      {/* ── Additional tests ──────────────────────────────────────────────── */}
      {sections.showAdditionalTests && (
        <FormSection
          title={labels.sectionAdditional}
          hazardHint={hazardHintLabels?.['additional']}
        >
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
      )}

      {/* ── Findings ──────────────────────────────────────────────────────── */}
      {sections.showFindings && (
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
      )}

      {/* ── Maternity risk checklist (OUG 96/2003) ────────────────────────── */}
      {sections.showMaternityRisk && (
        <FormSection title={labels.sectionMaternityRisk}>
          {MATERNITY_RISK_FACTORS.map(({ categoryKey, items }) => (
            <FullWidth key={categoryKey}>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {maternityRiskLabels?.[categoryKey] ?? categoryKey}
                </h3>
                <div className="border rounded-md divide-y">
                  {items.map((itemKey) => (
                    <YesNoField
                      key={itemKey}
                      label={maternityRiskLabels?.[itemKey] ?? itemKey}
                      value={getStr(values.maternityRisk, itemKey)}
                      onChange={(v) => updateJson('maternityRisk', itemKey, v)}
                      optYes={labels.optYes}
                      optNo={labels.optNo}
                      disabled={ro}
                    />
                  ))}
                </div>
              </div>
            </FullWidth>
          ))}
          {/* Findings narrative for maternity report */}
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
      )}

      {/* ── Certificate section (certificat_invatamant / certificat_magistratura) ── */}
      {sections.showCertificateFields && (
        <FormSection title={labels.sectionCertificate}>
          <FullWidth>
            <div className="space-y-2">
              <Label>{labels.fieldVerdict}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(examinationTypeCode === 'certificat_magistratura'
                  ? (['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const)
                  : (['apt', 'inapt'] as const)
                ).map((v) => (
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
                      name="cert-verdict"
                      value={v}
                      checked={values.verdict === v}
                      onChange={() => updateTop('verdict', v)}
                      disabled={ro}
                    />
                    <span>
                      {v === 'apt' && labels.certApt}
                      {v === 'inapt' && labels.certInapt}
                      {v === 'apt_conditionat' && labels.certAptConditionat}
                      {v === 'inapt_temporar' && labels.certInaptTemporar}
                    </span>
                  </label>
                ))}
              </div>
            </div>
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
      )}

      {/* ── Verdict ───────────────────────────────────────────────────────── */}
      {sections.showVerdict && (
        <FormSection title={labels.sectionVerdict}>
          <FullWidth>
            <div className="space-y-2">
              <Label>{labels.fieldVerdict}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(
                  ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const
                ).map((v) => (
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
                      {v === 'apt_conditionat' && labels.fieldVerdictAptConditionat}
                      {v === 'inapt_temporar' && labels.fieldVerdictInaptTemporar}
                      {v === 'inapt' && labels.fieldVerdictInapt}
                    </span>
                  </label>
                ))}
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
      )}

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

// ─── Helper subcomponents ────────────────────────────────────────────────────

function FormSection({
  title,
  hazardHint,
  children,
}: {
  title: string
  hazardHint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {hazardHint && (
          <span
            title={hazardHint}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
          >
            ⚑ {hazardHint}
          </span>
        )}
      </div>
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
  highlighted,
  highlightTooltip,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  type?: string
  step?: string
  disabled?: boolean
  highlighted?: boolean
  highlightTooltip?: string
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div
      className={`space-y-2${highlighted ? ' border-l-4 border-amber-400 pl-2' : ''}`}
      title={highlighted ? highlightTooltip : undefined}
    >
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

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function YesNoField({
  label,
  value,
  onChange,
  optYes,
  optNo,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  optYes: string
  optNo: string
  disabled?: boolean
}) {
  const name = `yn-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm pr-4">{label}</span>
      <div className="flex items-center gap-4 shrink-0">
        {(['da', 'nu'] as const).map((v) => (
          <label
            key={v}
            className={`flex items-center gap-1.5 text-sm ${
              disabled ? 'opacity-60' : 'cursor-pointer'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              disabled={disabled}
            />
            {v === 'da' ? optYes : optNo}
          </label>
        ))}
      </div>
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
  // Stored as array of strings — entered as a textarea with one per line.
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

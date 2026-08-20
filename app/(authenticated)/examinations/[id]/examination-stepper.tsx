'use client'

import type { ExaminationVerdict } from '@prisma/client'
import { Check, ClipboardList, Gavel, HeartPulse, Stethoscope } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { ExaminationHistorySummary } from '@/components/ai/ExaminationHistorySummary'
import { InvestigationRecommender } from '@/components/ai/InvestigationRecommender'
import { Button } from '@/components/ui/button'
import { useExaminationPrefill } from '@/hooks/useExaminationPrefill'
import { getSectionsForExamType } from '@/lib/examinations/document-templates'
import { toastSuccess } from '@/lib/toast'
import { calculateBmi, getStr } from './examination-field-components'
import { AnamnesisStep } from './steps/anamnesis-step'
import { ClinicalStep } from './steps/clinical-step'
import { FindingsStep } from './steps/findings-step'
import { VerdictStep } from './steps/verdict-step'

/**
 * Stepper shell for the examination detail form.
 *
 * Owns form state, save/prefill logic, and step navigation. Split out of
 * the original single-scroll examination-form.tsx so the doctor sees
 * 5-8 fields per step instead of ~30+ at once. Step content lives in
 * ./steps/*, shared field primitives in ./examination-field-components.
 */

// ─── Types (shared with steps/*) ───────────────────────────────────────────

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

export interface Labels {
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
  sectionMaternityRisk: string
  sectionCertificate: string
  certApt: string
  certInapt: string
  certAptConditionat: string
  certInaptTemporar: string
  prefillLoading: string
  prefillReady: string
  prefillApply: string
  prefillIgnore: string
  prefillNoData: string
  prefillTooltip: string
  stepAnamnesis: string
  stepClinical: string
  stepFindings: string
  stepVerdict: string
  stepBack: string
  stepContinue: string
  stepAutoSaved: string
}

interface Props {
  examinationId: string
  employeeId: string
  examinationTypeCode: string
  locked: boolean
  signed: boolean
  initialValues: ExaminationFormValues
  defaultIntervalMonths: number
  labels: Labels
  hazardHintLabels?: Record<string, string>
  maternityRiskLabels?: Record<string, string>
  prefillEnabled: boolean
  documentsPanel?: ReactNode
  documentsSection?: ReactNode
  examinationActions?: ReactNode
}

const STEP_COUNT = 4

// ─── Main component ─────────────────────────────────────────────────────────

export function ExaminationStepper({
  examinationId,
  employeeId,
  examinationTypeCode,
  locked,
  signed,
  initialValues,
  defaultIntervalMonths,
  labels,
  hazardHintLabels,
  maternityRiskLabels,
  prefillEnabled,
  documentsPanel,
  documentsSection,
  examinationActions,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [values, setValues] = useState<ExaminationFormValues>(initialValues)
  const savedValuesRef = useRef<ExaminationFormValues>(initialValues)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefillApplied, setPrefillApplied] = useState(false)
  const [prefillDismissed, setPrefillDismissed] = useState(false)
  const [prefillHighlighted, setPrefillHighlighted] = useState<Map<string, 'med' | 'low'>>(
    new Map()
  )

  const [activeStep, setActiveStep] = useState(() => {
    const fromUrl = parseInt(searchParams.get('step') ?? '', 10)
    return Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl < STEP_COUNT ? fromUrl : 0
  })

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

  // ─── Update helpers ─────────────────────────────────────────────────────

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

  function isHighlighted(bucket: string, key: string): boolean {
    return prefillHighlighted.has(`${bucket}.${key}`)
  }

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

  // ─── Dirty tracking ─────────────────────────────────────────────────────

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(savedValuesRef.current),
    [values]
  )

  // ─── Save ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (options?: { silent?: boolean }) => {
      if (locked) return
      setSaving(true)
      setError(null)
      setSavedAt(null)

      const numericVitalKeys = ['height', 'weight', 'bpSystolic', 'bpDiastolic', 'pulse'] as const
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
            if (!Number.isNaN(n)) out[k] = n
          }
        }
        return out
      }

      const bmi = calculateBmi(values.vitalSigns)

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
          return false
        }
        savedValuesRef.current = values
        setSavedAt(Date.now())
        if (prefillApplied) setPrefillApplied(false)
        if (options?.silent) toastSuccess(labels.stepAutoSaved)
        startTransition(() => {
          router.refresh()
        })
        return true
      } catch (err) {
        console.error('Save failed', err)
        setError(labels.errorMessage)
        return false
      } finally {
        setSaving(false)
      }
    },
    [examinationId, labels, locked, prefillApplied, router, values]
  )

  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 3000)
    return () => clearTimeout(t)
  }, [savedAt])

  // ─── Step navigation (auto-saves dirty changes before switching) ──────────

  const goToStep = useCallback(
    async (index: number) => {
      const clamped = Math.max(0, Math.min(STEP_COUNT - 1, index))
      if (clamped === activeStep) return
      if (!locked && isDirty) {
        await handleSave({ silent: true })
      }
      setActiveStep(clamped)
      const params = new URLSearchParams(searchParams.toString())
      params.set('step', String(clamped))
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [activeStep, handleSave, isDirty, locked, router, searchParams]
  )

  // ─── Keyboard shortcuts (ignored while typing in a field) ─────────────────

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      if (e.key === 'ArrowLeft') {
        void goToStep(activeStep - 1)
      } else if (e.key === 'ArrowRight') {
        void goToStep(activeStep + 1)
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        void goToStep(Number(e.key) - 1)
      } else if (e.key === 'Enter' && !locked) {
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeStep, goToStep, handleSave, locked])

  // ─── Step completion (informational only — steps are never gated) ─────────

  const stepDone = [
    getStr(values.anamnesis, 'general') !== '',
    getStr(values.vitalSigns, 'height') !== '' && getStr(values.vitalSigns, 'weight') !== '',
    values.clinicalFindings !== '',
    values.verdict !== null,
  ]

  const steps = [
    { label: labels.stepAnamnesis, Icon: Stethoscope },
    { label: labels.stepClinical, Icon: HeartPulse },
    { label: labels.stepFindings, Icon: ClipboardList },
    { label: labels.stepVerdict, Icon: Gavel },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_260px] gap-6 items-start">
      {/* Mobile: horizontal scrollable pill bar */}
      <nav className="flex lg:hidden gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {steps.map((step, i) => (
          <button
            key={step.label}
            type="button"
            onClick={() => void goToStep(i)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeStep === i
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            {stepDone[i] && activeStep !== i ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <span className="tabular-nums">{i + 1}</span>
            )}
            {step.label}
          </button>
        ))}
      </nav>

      {/* Desktop: vertical step navigation */}
      <nav className="hidden lg:flex lg:flex-col lg:sticky lg:top-24 gap-1">
        {steps.map(({ label, Icon }, i) => {
          const active = activeStep === i
          const done = stepDone[i] && !active
          return (
            <button
              key={label}
              type="button"
              onClick={() => void goToStep(i)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs shrink-0 ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : 'border-input'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Active step content */}
      <div className="space-y-8 min-w-0">
        {signed && (
          <div className="border border-green-300 bg-green-50 text-green-900 rounded-md px-4 py-3 text-sm">
            {labels.signedNotice}
          </div>
        )}

        {activeStep === 0 && (
          <AnamnesisStep
            values={values}
            updateJson={updateJson}
            locked={locked}
            labels={labels}
            sections={sections}
            isHighlighted={isHighlighted}
            prefillEnabled={prefillEnabled}
            prefillDismissed={prefillDismissed}
            prefillStatus={prefillStatus}
            prefillCount={prefillCount}
            showPrefillBanner={showPrefillBanner}
            onApplyPrefill={handleApplyPrefill}
            onDismissPrefill={() => setPrefillDismissed(true)}
          />
        )}
        {activeStep === 1 && (
          <ClinicalStep
            values={values}
            updateJson={updateJson}
            locked={locked}
            labels={labels}
            sections={sections}
            hazardHintLabels={hazardHintLabels}
            isHighlighted={isHighlighted}
          />
        )}
        {activeStep === 2 && (
          <FindingsStep
            values={values}
            updateJson={updateJson}
            updateTop={updateTop}
            locked={locked}
            labels={labels}
            sections={sections}
            hazardHintLabels={hazardHintLabels}
            maternityRiskLabels={maternityRiskLabels}
          />
        )}
        {activeStep === 3 && (
          <VerdictStep
            values={values}
            updateTop={updateTop}
            locked={locked}
            labels={labels}
            sections={sections}
            examinationTypeCode={examinationTypeCode}
            defaultIntervalMonths={defaultIntervalMonths}
            documentsPanel={documentsPanel}
            documentsSection={documentsSection}
            examinationActions={examinationActions}
          />
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            {error}
          </div>
        )}

        {!locked && (
          <div className="flex items-center justify-between gap-3 sticky bottom-4 bg-background border rounded-md p-3 shadow-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => void goToStep(activeStep - 1)}
              disabled={activeStep === 0}
            >
              ← {labels.stepBack}
            </Button>
            <div className="flex items-center gap-3">
              {savedAt && <span className="text-xs text-green-700">{labels.savedToast}</span>}
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? labels.saving : labels.saveButton}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void goToStep(activeStep + 1)}
              disabled={activeStep === STEP_COUNT - 1}
            >
              {labels.stepContinue} →
            </Button>
          </div>
        )}
      </div>

      {/* AI sidebar — conditional per step */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        {activeStep === 0 && (
          <ExaminationHistorySummary currentExaminationId={examinationId} employeeId={employeeId} />
        )}
        {(activeStep === 1 || activeStep === 2) && (
          <InvestigationRecommender examinationId={examinationId} />
        )}
        {activeStep === 2 && (
          <ExaminationHistorySummary currentExaminationId={examinationId} employeeId={employeeId} />
        )}
      </aside>
    </div>
  )
}

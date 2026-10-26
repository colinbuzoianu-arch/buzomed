/**
 * Deterministic pre-sign checklist for control_periodic examinations: "what is
 * still blank on the printed sheets". NO AI — pure derivation from the current
 * form values plus a few employee/company presence flags.
 *
 * Two levels:
 *  - 'fisa'  → missing data for the fișă de aptitudine (job function, CNP,
 *              company address). Verdict and examinedAt are already enforced by
 *              the sign route, so they are deliberately NOT repeated here.
 *  - 'foaie' → blank fields on "Examen medical periodic": sections 1–11 grouped
 *              per section, header/analyzer fields, conclusions, glycemia, and
 *              "Modificat" items left without their mandatory note.
 *
 * Every check carries the stepper step index and a stable `fieldKey` that maps
 * to a `data-sheet-key` attribute in the UI so a row can jump to the field.
 *
 * ID scheme (mirrored by the dismissedChecks validator in clinical-exam.ts):
 *   fisa:jobTitle | fisa:cnp | fisa:companyAddress
 *   foaie:section:<sectionKey> | foaie:note:<itemKey> | foaie:field:<bucket.key>
 */

import {
  CLINICAL_CONCLUSION_ITEMS,
  CLINICAL_EXAM_SECTIONS,
  CLINICAL_SPECIALTY_CONCLUSION,
  effectiveSource,
  SUPPLEMENTARY_EXAM_KEYS,
} from './clinical-exam'

export interface SheetCheck {
  id: string
  level: 'fisa' | 'foaie'
  label: string
  step: number
  fieldKey: string
}

export interface SheetCheckInput {
  clinicalExam: Record<string, unknown>
  visionTest: Record<string, unknown>
  hearingTest: Record<string, unknown>
  anamnesis: Record<string, unknown>
  additionalTests: Record<string, unknown>
  vitalSigns: Record<string, unknown>
  clinicalFindings: string
  employeeJobTitle: string | null | undefined
  employeeHasCnp: boolean
  companyAddressPresent: boolean
}

// Stepper step indices (AnamnesisStep, ClinicalStep, FindingsStep, VerdictStep).
const STEP_ANAMNESIS = 0
const STEP_CLINIC = 1
const STEP_INVESTIG = 2

function s(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key]
  return v !== null && v !== undefined && v !== '' ? String(v) : ''
}

export function computeSheetChecks(input: SheetCheckInput): SheetCheck[] {
  const checks: SheetCheck[] = []
  const { clinicalExam, visionTest, hearingTest, anamnesis, additionalTests, vitalSigns } = input

  // ─── Fișa de aptitudine (red) ─────────────────────────────────────────────
  if (!input.employeeJobTitle || input.employeeJobTitle.trim() === '') {
    checks.push({
      id: 'fisa:jobTitle',
      level: 'fisa',
      label: 'Funcția angajatului lipsește',
      step: STEP_INVESTIG,
      fieldKey: 'employee.jobTitle',
    })
  }
  if (!input.employeeHasCnp) {
    checks.push({
      id: 'fisa:cnp',
      level: 'fisa',
      label: 'CNP-ul angajatului lipsește',
      step: STEP_INVESTIG,
      fieldKey: 'employee.idDocumentNumber',
    })
  }
  if (!input.companyAddressPresent) {
    checks.push({
      id: 'fisa:companyAddress',
      level: 'fisa',
      label: 'Adresa firmei lipsește',
      step: STEP_INVESTIG,
      fieldKey: 'company.address',
    })
  }

  // ─── Foaia de examen periodic (grey) ──────────────────────────────────────

  // Antet / analyzer fields that aren't clinical-exam items.
  const field = (
    missing: boolean,
    key: string,
    label: string,
    step: number,
    fieldKey: string
  ) => {
    if (missing) checks.push({ id: `foaie:field:${key}`, level: 'foaie', label, step, fieldKey })
  }

  field(
    s(anamnesis, 'asymptomatic') === '',
    'anamnesis.asymptomatic',
    'Asimptomatic (antet)',
    STEP_ANAMNESIS,
    'anamnesis.asymptomatic'
  )
  field(
    s(vitalSigns, 'height') === '',
    'vitalSigns.height',
    'Înălțime (antet)',
    STEP_CLINIC,
    'vitalSigns.height'
  )
  field(
    s(vitalSigns, 'weight') === '',
    'vitalSigns.weight',
    'Greutate (antet)',
    STEP_CLINIC,
    'vitalSigns.weight'
  )
  field(
    s(vitalSigns, 'bpSystolic') === '' || s(vitalSigns, 'bpDiastolic') === '',
    'vitalSigns.bpSystolic',
    'Tensiune arterială (§6)',
    STEP_CLINIC,
    'vitalSigns.bpSystolic'
  )
  field(
    s(vitalSigns, 'pulse') === '',
    'vitalSigns.pulse',
    'AV / puls (§6)',
    STEP_CLINIC,
    'vitalSigns.pulse'
  )
  field(
    s(visionTest, 'right') === '',
    'visionTest.right',
    'Acuitate vizuală OD — distanță (§10)',
    STEP_CLINIC,
    'visionTest.right'
  )
  field(
    s(visionTest, 'left') === '',
    'visionTest.left',
    'Acuitate vizuală OS — distanță (§10)',
    STEP_CLINIC,
    'visionTest.left'
  )
  field(
    s(visionTest, 'colorResult') === '',
    'visionTest.colorResult',
    'Simț cromatic (§10)',
    STEP_CLINIC,
    'section:analizatori'
  )
  field(
    s(hearingTest, 'voice') === '',
    'hearingTest.voice',
    'Voce (§10)',
    STEP_CLINIC,
    'section:analizatori'
  )

  // Sections 1–11: clinical-exam items that are unset, grouped per section.
  // §10 (analyzers) carries no clinicalExam-stored items (vision/hearing live
  // on their own buckets and are checked individually above).
  for (const section of CLINICAL_EXAM_SECTIONS) {
    const unset: string[] = []
    for (const item of section.items) {
      if (effectiveSource(item) !== 'clinicalExam') continue
      // Conditional sub-item only matters once its trigger is set.
      if (item.key === 'abdomenPalpare' && s(clinicalExam, 'abdomen') !== 'dureros') continue
      if (s(clinicalExam, item.key) === '') unset.push(item.label)
    }
    if (unset.length > 0) {
      checks.push({
        id: `foaie:section:${section.key}`,
        level: 'foaie',
        label: `§${section.number} ${section.label}: ${unset.join(', ')}`,
        step: STEP_CLINIC,
        fieldKey: `section:${section.key}`,
      })
    }
  }

  // "Modificat" single-normal items (abnormal option prints no checkbox) left
  // without their mandatory note.
  for (const section of CLINICAL_EXAM_SECTIONS) {
    for (const item of section.items) {
      if (item.kind !== 'choice' || effectiveSource(item) !== 'clinicalExam' || !item.noteKey) {
        continue
      }
      const v = s(clinicalExam, item.key)
      if (v === '' || v === item.normal) continue
      const opt = item.options.find((o) => o.value === v)
      if (opt && opt.checkboxKey === undefined && s(clinicalExam, item.noteKey) === '') {
        checks.push({
          id: `foaie:note:${item.key}`,
          level: 'foaie',
          label: `§${section.number} ${section.label}: notă lipsă (${item.label})`,
          step: STEP_CLINIC,
          fieldKey: `section:${section.key}`,
        })
      }
    }
  }

  // Clinical conclusion status (part of the systems exam, §Concluzii).
  const conclusion = CLINICAL_CONCLUSION_ITEMS.find((i) => i.key === 'conclusion')
  if (conclusion && s(clinicalExam, 'conclusion') === '') {
    checks.push({
      id: 'foaie:field:clinicalExam.conclusion',
      level: 'foaie',
      label: 'Concluzii examen clinic (status)',
      step: STEP_CLINIC,
      fieldKey: 'clinicalExam.conclusion',
    })
  }

  // Specialty conclusion status + its free text (Investigații step).
  if (CLINICAL_SPECIALTY_CONCLUSION && s(clinicalExam, 'specialtyConclusion') === '') {
    checks.push({
      id: 'foaie:field:clinicalExam.specialtyConclusion',
      level: 'foaie',
      label: 'Concluziile examinării de specialitate (status)',
      step: STEP_INVESTIG,
      fieldKey: 'clinicalExam.specialtyConclusion',
    })
  }
  if (input.clinicalFindings.trim() === '') {
    checks.push({
      id: 'foaie:field:clinicalFindings',
      level: 'foaie',
      label: 'Constatări clinice (concluzii de specialitate)',
      step: STEP_INVESTIG,
      fieldKey: 'clinicalFindings',
    })
  }

  // Glycemia value required once the Glicemie exam is ordered.
  const ordered = Array.isArray(additionalTests?.ordered)
    ? (additionalTests.ordered as unknown[])
    : []
  if (
    ordered.includes('glicemie') &&
    SUPPLEMENTARY_EXAM_KEYS.has('glicemie') &&
    s(additionalTests, 'glycemia') === ''
  ) {
    checks.push({
      id: 'foaie:field:additionalTests.glycemia',
      level: 'foaie',
      label: 'Glicemie — valoare lipsă',
      step: STEP_INVESTIG,
      fieldKey: 'additionalTests.glycemia',
    })
  }

  return checks
}

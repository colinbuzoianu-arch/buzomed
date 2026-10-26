'use client'

import {
  CLINICAL_SPECIALTY_CONCLUSION,
  SUPPLEMENTARY_EXAMS,
} from '@/lib/examinations/clinical-exam'
import { CheckField, getStr } from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

/**
 * Periodic-only "Investigații și concluzii" block (Constatări step).
 *
 * - Examene suplimentare: a checkbox grid stored as `additionalTests.ordered`
 *   (string[] of SUPPLEMENTARY_EXAMS keys, kept in the sheet's canonical
 *   order). The existing free-text lab/imaging/other fields stay as they are.
 * - Glicemie value: `additionalTests.glycemia`, shown only when Glicemie is
 *   ticked.
 * - Concluziile examinării de specialitate: `clinicalExam.specialtyConclusion`
 *   (sănătos / diagnostic). Its free text stays the existing clinicalFindings
 *   field in the Constatări section (→ spec_text), so nothing is stored twice.
 *
 * No automatic pre-checking from the risk profile in this iteration.
 */

type UpdateJson = <K extends keyof ExaminationFormValues>(
  bucket: K,
  key: string,
  value: unknown
) => void

interface Props {
  values: ExaminationFormValues
  updateJson: UpdateJson
  locked: boolean
  labels: Labels
}

export function SupplementaryExams({ values, updateJson, locked, labels }: Props) {
  const ro = locked
  const orderedRaw = values.additionalTests?.ordered
  const ordered = Array.isArray(orderedRaw) ? (orderedRaw as string[]) : []
  const orderedSet = new Set(ordered)

  function toggle(key: string, on: boolean) {
    const next = new Set(orderedSet)
    if (on) next.add(key)
    else next.delete(key)
    // Persist in the sheet's canonical order (same as the server normalizes).
    updateJson(
      'additionalTests',
      'ordered',
      SUPPLEMENTARY_EXAMS.map((e) => e.key).filter((k) => next.has(k))
    )
  }

  const specValue = getStr(values.clinicalExam ?? {}, 'specialtyConclusion')

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">{labels.suppExamsTitle}</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {SUPPLEMENTARY_EXAMS.map((exam) => (
            <CheckField
              key={exam.key}
              label={exam.label}
              checked={orderedSet.has(exam.key)}
              onChange={(v) => toggle(exam.key, v)}
              disabled={ro}
            />
          ))}
        </div>

        {/* Glicemie value — only when the Glicemie exam is ordered. */}
        {orderedSet.has('glicemie') && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <span className="text-sm">{labels.glycemiaLabel}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={getStr(values.additionalTests ?? {}, 'glycemia')}
              onChange={(e) => updateJson('additionalTests', 'glycemia', e.target.value)}
              disabled={ro}
              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
            />
          </div>
        )}
      </div>

      {/* Concluziile examinării de specialitate (sănătos / diagnostic). */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{labels.specialtyConclusionTitle}</span>
        <div className="inline-flex flex-wrap gap-1">
          {CLINICAL_SPECIALTY_CONCLUSION.options.map((o) => {
            const active = specValue === o.value
            return (
              <button
                key={o.value}
                type="button"
                disabled={ro}
                onClick={() =>
                  updateJson('clinicalExam', 'specialtyConclusion', active ? '' : o.value)
                }
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-input text-muted-foreground hover:bg-muted'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

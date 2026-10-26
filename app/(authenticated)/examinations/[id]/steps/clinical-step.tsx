'use client'

import { useMemo } from 'react'
import { NonPrintingGroup, SheetMarker } from '@/components/examinations/sheet-marker'
import { computeObesityFromBmi } from '@/lib/examinations/clinical-exam'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import {
  COLOR_PERCEPTION_MAX_LENGTH,
  getSheetRef,
  type SheetRef,
} from '@/lib/examinations/periodic-sheet-map'
import {
  CheckField,
  calculateBmi,
  CompactField,
  Field,
  FormSection,
  FullWidth,
  getNum,
  getStr,
} from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'
import { ClinicalSystemsExam } from './clinical-systems-exam'

interface Props {
  values: ExaminationFormValues
  updateJson: <K extends keyof ExaminationFormValues>(
    bucket: K,
    key: string,
    value: unknown
  ) => void
  locked: boolean
  labels: Labels
  sections: ExamSectionConfig
  hazardHintLabels?: Record<string, string>
  isHighlighted: (bucket: string, key: string) => boolean
}

export function ClinicalStep({
  values,
  updateJson,
  locked,
  labels,
  sections,
  hazardHintLabels,
  isHighlighted,
}: Props) {
  const ro = locked
  const bmi = useMemo(() => calculateBmi(values.vitalSigns), [values.vitalSigns])
  // Obesity is derived from BMI and shown read-only (never stored); the PDF
  // recomputes it the same way at print time.
  const obesity = useMemo(() => {
    const n = bmi ? parseFloat(bmi) : null
    const { obese, grade } = computeObesityFromBmi(n)
    if (n === null || Number.isNaN(n)) return ''
    return obese ? `${labels.optYes} (gr. ${grade})` : labels.optNo
  }, [bmi, labels.optYes, labels.optNo])

  const isPeriodic = sections.showClinicalSystemsExam
  const ref = (k: string) => (isPeriodic ? getSheetRef(k) : undefined)

  return (
    <>
      {isPeriodic && <p className="text-sm text-muted-foreground">{labels.sheetStepClinic}</p>}

      {sections.showVitalSigns &&
        (isPeriodic ? (
          <CompactVitals
            values={values}
            updateJson={updateJson}
            ro={ro}
            bmi={bmi}
            obesity={obesity}
            labels={labels}
            ref={ref}
          />
        ) : (
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
            sheetRef={ref('vitalSigns.height')}
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
            sheetRef={ref('vitalSigns.weight')}
          />
          <Field
            label={labels.fieldBmi}
            value={bmi}
            onChange={() => {}}
            disabled
            type="number"
            sheetRef={ref('vitalSigns.bmi')}
          />
          {sections.showClinicalSystemsExam && (
            <Field
              label={labels.obesityLabel}
              value={obesity}
              onChange={() => {}}
              disabled
              sheetRef={ref('computed.obesity')}
            />
          )}
          <Field
            label={labels.fieldBpSystolic}
            value={getNum(values.vitalSigns, 'bpSystolic')}
            onChange={(v) => updateJson('vitalSigns', 'bpSystolic', v)}
            type="number"
            disabled={ro}
            sheetRef={ref('vitalSigns.bpSystolic')}
          />
          <Field
            label={labels.fieldBpDiastolic}
            value={getNum(values.vitalSigns, 'bpDiastolic')}
            onChange={(v) => updateJson('vitalSigns', 'bpDiastolic', v)}
            type="number"
            disabled={ro}
            sheetRef={ref('vitalSigns.bpDiastolic')}
          />
          <Field
            label={labels.fieldPulse}
            value={getNum(values.vitalSigns, 'pulse')}
            onChange={(v) => updateJson('vitalSigns', 'pulse', v)}
            type="number"
            disabled={ro}
            sheetRef={ref('vitalSigns.pulse')}
          />
          <FullWidth>
            <NonPrintingGroup active={isPeriodic} heading={labels.sheetNonPrinting}>
              <Field
                label={labels.fieldAdditionalNotes}
                value={getStr(values.vitalSigns, 'additionalNotes')}
                onChange={(v) => updateJson('vitalSigns', 'additionalNotes', v)}
                multiline
                disabled={ro}
              />
            </NonPrintingGroup>
          </FullWidth>
        </FormSection>
        ))}

      {sections.showVision &&
        (isPeriodic ? (
          <CompactVision
            values={values}
            updateJson={updateJson}
            ro={ro}
            labels={labels}
            ref={ref}
          />
        ) : (
        <FormSection title={labels.sectionVision}>
          <Field
            label={labels.fieldVisionLeft}
            value={getStr(values.visionTest, 'left')}
            onChange={(v) => updateJson('visionTest', 'left', v)}
            disabled={ro}
            sheetRef={ref('visionTest.left')}
          />
          <Field
            label={labels.fieldVisionRight}
            value={getStr(values.visionTest, 'right')}
            onChange={(v) => updateJson('visionTest', 'right', v)}
            disabled={ro}
            sheetRef={ref('visionTest.right')}
          />
          <FullWidth>
            <CheckField
              label={labels.fieldVisionWithCorrection}
              checked={Boolean(values.visionTest.withCorrection)}
              onChange={(v) => updateJson('visionTest', 'withCorrection', v)}
              disabled={ro}
              sheetRef={ref('visionTest.withCorrection')}
            />
          </FullWidth>
          <Field
            label={labels.fieldVisionColor}
            value={getStr(values.visionTest, 'colorPerception')}
            onChange={(v) => updateJson('visionTest', 'colorPerception', v)}
            disabled={ro}
            sheetRef={ref('visionTest.colorPerception')}
            maxLength={isPeriodic ? COLOR_PERCEPTION_MAX_LENGTH : undefined}
            example={ref('visionTest.colorPerception')?.example}
            hint={ref('visionTest.colorPerception')?.hint}
          />
          <FullWidth>
            <NonPrintingGroup active={isPeriodic} heading={labels.sheetNonPrinting}>
              <Field
                label={labels.fieldAdditionalNotes}
                value={getStr(values.visionTest, 'additionalNotes')}
                onChange={(v) => updateJson('visionTest', 'additionalNotes', v)}
                multiline
                disabled={ro}
              />
            </NonPrintingGroup>
          </FullWidth>
        </FormSection>
        ))}

      {sections.showHearing &&
        (isPeriodic ? (
          <CompactHearing
            values={values}
            updateJson={updateJson}
            ro={ro}
            labels={labels}
            hazardHint={hazardHintLabels?.['hearing']}
          />
        ) : (
        <NonPrintingGroup active={isPeriodic} heading={labels.sheetNonPrinting}>
        <FormSection title={labels.sectionHearing} hazardHint={hazardHintLabels?.['hearing']}>
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
        </NonPrintingGroup>
        ))}

      {sections.showLung &&
        (isPeriodic ? (
          <CompactLung
            values={values}
            updateJson={updateJson}
            ro={ro}
            labels={labels}
            hazardHint={hazardHintLabels?.['lung']}
          />
        ) : (
        <NonPrintingGroup active={isPeriodic} heading={labels.sheetNonPrinting}>
        <FormSection title={labels.sectionLung} hazardHint={hazardHintLabels?.['lung']}>
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
        </NonPrintingGroup>
        ))}

      {sections.showClinicalSystemsExam && (
        <ClinicalSystemsExam
          values={values}
          updateJson={updateJson}
          locked={locked}
          labels={labels}
        />
      )}
    </>
  )
}

// ─── Compact periodic layouts (control_periodic only) ───────────────────────
// Dense versions of the vitals / vision / hearing / spirometry sections so the
// doctor doesn't scroll past full-width fields. Same fields, markers, grouping
// and counters — just small inputs on wrapping rows.

type UpdateJson = <K extends keyof ExaminationFormValues>(
  bucket: K,
  key: string,
  value: unknown
) => void
type SheetRefFn = (k: string) => SheetRef | undefined

function NonPrintNote({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  label: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={label}
      aria-label={label}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
    />
  )
}

function CompactVitals({
  values,
  updateJson,
  ro,
  bmi,
  obesity,
  labels,
  ref,
}: {
  values: ExaminationFormValues
  updateJson: UpdateJson
  ro: boolean
  bmi: string
  obesity: string
  labels: Labels
  ref: SheetRefFn
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{labels.sectionVitalSigns}</h2>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <CompactField
          label={labels.fieldHeight}
          unit="cm"
          type="number"
          step="0.1"
          value={getNum(values.vitalSigns, 'height')}
          onChange={(v) => updateJson('vitalSigns', 'height', v)}
          disabled={ro}
          sheetRef={ref('vitalSigns.height')}
          dataSheetKey="vitalSigns.height"
        />
        <CompactField
          label={labels.fieldWeight}
          unit="kg"
          type="number"
          step="0.1"
          value={getNum(values.vitalSigns, 'weight')}
          onChange={(v) => updateJson('vitalSigns', 'weight', v)}
          disabled={ro}
          sheetRef={ref('vitalSigns.weight')}
          dataSheetKey="vitalSigns.weight"
        />
        <CompactField
          label={labels.fieldBmi}
          type="number"
          value={bmi}
          onChange={() => {}}
          disabled
          sheetRef={ref('vitalSigns.bmi')}
        />
        <CompactField
          label={labels.obesityLabel}
          value={obesity}
          onChange={() => {}}
          disabled
          widthClass="w-28"
          sheetRef={ref('computed.obesity')}
        />
        <CompactField
          label={labels.fieldBpSystolic}
          unit="mmHg"
          type="number"
          value={getNum(values.vitalSigns, 'bpSystolic')}
          onChange={(v) => updateJson('vitalSigns', 'bpSystolic', v)}
          disabled={ro}
          widthClass="w-14"
          sheetRef={ref('vitalSigns.bpSystolic')}
          dataSheetKey="vitalSigns.bpSystolic"
        />
        <CompactField
          label={labels.fieldBpDiastolic}
          unit="mmHg"
          type="number"
          value={getNum(values.vitalSigns, 'bpDiastolic')}
          onChange={(v) => updateJson('vitalSigns', 'bpDiastolic', v)}
          disabled={ro}
          widthClass="w-14"
          sheetRef={ref('vitalSigns.bpDiastolic')}
        />
        <CompactField
          label={labels.fieldPulse}
          unit="bpm"
          type="number"
          value={getNum(values.vitalSigns, 'pulse')}
          onChange={(v) => updateJson('vitalSigns', 'pulse', v)}
          disabled={ro}
          sheetRef={ref('vitalSigns.pulse')}
          dataSheetKey="vitalSigns.pulse"
        />
      </div>
      <NonPrintingGroup active heading={labels.sheetNonPrinting}>
        <NonPrintNote
          value={getStr(values.vitalSigns, 'additionalNotes')}
          onChange={(v) => updateJson('vitalSigns', 'additionalNotes', v)}
          disabled={ro}
          label={labels.fieldAdditionalNotes}
        />
      </NonPrintingGroup>
    </section>
  )
}

function CompactVision({
  values,
  updateJson,
  ro,
  labels,
  ref,
}: {
  values: ExaminationFormValues
  updateJson: UpdateJson
  ro: boolean
  labels: Labels
  ref: SheetRefFn
}) {
  const colorRef = ref('visionTest.colorPerception')
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{labels.sectionVision}</h2>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <CompactField
          label={labels.fieldVisionLeft}
          value={getStr(values.visionTest, 'left')}
          onChange={(v) => updateJson('visionTest', 'left', v)}
          disabled={ro}
          sheetRef={ref('visionTest.left')}
          dataSheetKey="visionTest.left"
        />
        <CompactField
          label={labels.fieldVisionRight}
          value={getStr(values.visionTest, 'right')}
          onChange={(v) => updateJson('visionTest', 'right', v)}
          disabled={ro}
          sheetRef={ref('visionTest.right')}
          dataSheetKey="visionTest.right"
        />
        <label className="inline-flex items-center gap-1.5 self-end pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={Boolean(values.visionTest.withCorrection)}
            onChange={(e) => updateJson('visionTest', 'withCorrection', e.target.checked)}
            disabled={ro}
          />
          <span className="inline-flex items-center gap-1">
            {labels.fieldVisionWithCorrection}
            {ref('visionTest.withCorrection') && (
              <SheetMarker sheetRef={ref('visionTest.withCorrection')} />
            )}
          </span>
        </label>
        <CompactField
          label={labels.fieldVisionColor}
          value={getStr(values.visionTest, 'colorPerception')}
          onChange={(v) => updateJson('visionTest', 'colorPerception', v)}
          disabled={ro}
          widthClass="w-44"
          sheetRef={colorRef}
          maxLength={COLOR_PERCEPTION_MAX_LENGTH}
          example={colorRef?.example}
          hint={colorRef?.hint}
        />
      </div>
      <NonPrintingGroup active heading={labels.sheetNonPrinting}>
        <NonPrintNote
          value={getStr(values.visionTest, 'additionalNotes')}
          onChange={(v) => updateJson('visionTest', 'additionalNotes', v)}
          disabled={ro}
          label={labels.fieldAdditionalNotes}
        />
      </NonPrintingGroup>
    </section>
  )
}

function CompactHearing({
  values,
  updateJson,
  ro,
  labels,
  hazardHint,
}: {
  values: ExaminationFormValues
  updateJson: UpdateJson
  ro: boolean
  labels: Labels
  hazardHint?: string
}) {
  return (
    <NonPrintingGroup active heading={labels.sheetNonPrinting}>
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {labels.sectionHearing}
          {hazardHint && (
            <span
              title={hazardHint}
              className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
            >
              ⚑ {hazardHint}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <CompactField
            label={labels.fieldHearingLeft}
            value={getStr(values.hearingTest, 'left')}
            onChange={(v) => updateJson('hearingTest', 'left', v)}
            disabled={ro}
            widthClass="w-24"
          />
          <CompactField
            label={labels.fieldHearingRight}
            value={getStr(values.hearingTest, 'right')}
            onChange={(v) => updateJson('hearingTest', 'right', v)}
            disabled={ro}
            widthClass="w-24"
          />
          <div className="min-w-[12rem] flex-1">
            <span className="mb-0.5 block text-xs text-muted-foreground">
              {labels.fieldAdditionalNotes}
            </span>
            <NonPrintNote
              value={getStr(values.hearingTest, 'additionalNotes')}
              onChange={(v) => updateJson('hearingTest', 'additionalNotes', v)}
              disabled={ro}
              label={labels.fieldAdditionalNotes}
            />
          </div>
        </div>
      </section>
    </NonPrintingGroup>
  )
}

function CompactLung({
  values,
  updateJson,
  ro,
  labels,
  hazardHint,
}: {
  values: ExaminationFormValues
  updateJson: UpdateJson
  ro: boolean
  labels: Labels
  hazardHint?: string
}) {
  return (
    <NonPrintingGroup active heading={labels.sheetNonPrinting}>
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {labels.sectionLung}
          {hazardHint && (
            <span
              title={hazardHint}
              className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
            >
              ⚑ {hazardHint}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <CompactField
            label={labels.fieldLungFev1}
            type="number"
            step="0.01"
            value={getNum(values.lungFunction, 'fev1')}
            onChange={(v) => updateJson('lungFunction', 'fev1', v)}
            disabled={ro}
          />
          <CompactField
            label={labels.fieldLungFvc}
            type="number"
            step="0.01"
            value={getNum(values.lungFunction, 'fvc')}
            onChange={(v) => updateJson('lungFunction', 'fvc', v)}
            disabled={ro}
          />
          <CompactField
            label={labels.fieldLungRatio}
            type="number"
            step="0.01"
            value={getNum(values.lungFunction, 'ratio')}
            onChange={(v) => updateJson('lungFunction', 'ratio', v)}
            disabled={ro}
          />
          <div className="min-w-[12rem] flex-1">
            <span className="mb-0.5 block text-xs text-muted-foreground">
              {labels.fieldAdditionalNotes}
            </span>
            <NonPrintNote
              value={getStr(values.lungFunction, 'additionalNotes')}
              onChange={(v) => updateJson('lungFunction', 'additionalNotes', v)}
              disabled={ro}
              label={labels.fieldAdditionalNotes}
            />
          </div>
        </div>
      </section>
    </NonPrintingGroup>
  )
}

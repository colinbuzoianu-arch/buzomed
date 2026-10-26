'use client'

import { useMemo } from 'react'
import { NonPrintingGroup } from '@/components/examinations/sheet-marker'
import { computeObesityFromBmi } from '@/lib/examinations/clinical-exam'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import { COLOR_PERCEPTION_MAX_LENGTH, getSheetRef } from '@/lib/examinations/periodic-sheet-map'
import {
  CheckField,
  calculateBmi,
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
      )}

      {sections.showVision && (
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
      )}

      {sections.showHearing && (
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
      )}

      {sections.showLung && (
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
      )}

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

'use client'

import { useMemo } from 'react'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
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

  return (
    <>
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
          <Field label={labels.fieldBmi} value={bmi} onChange={() => {}} disabled type="number" />
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

      {sections.showHearing && (
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
      )}

      {sections.showLung && (
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
      )}
    </>
  )
}

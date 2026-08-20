'use client'

import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import {
  DiagnosesField,
  Field,
  FormSection,
  FullWidth,
  getStr,
  YesNoField,
} from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

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
    items: ['substanteR40', 'substanteR61', 'mercur', 'citostatice', 'monoxidCarbon', 'plumb'],
  },
  {
    categoryKey: 'categoryWorkConditions',
    items: ['actSubterana', 'lucruNocturn'],
  },
]

interface Props {
  values: ExaminationFormValues
  updateJson: <K extends keyof ExaminationFormValues>(
    bucket: K,
    key: string,
    value: unknown
  ) => void
  updateTop: <K extends keyof ExaminationFormValues>(
    key: K,
    value: ExaminationFormValues[K]
  ) => void
  locked: boolean
  labels: Labels
  sections: ExamSectionConfig
  hazardHintLabels?: Record<string, string>
  maternityRiskLabels?: Record<string, string>
}

export function FindingsStep({
  values,
  updateJson,
  updateTop,
  locked,
  labels,
  sections,
  hazardHintLabels,
  maternityRiskLabels,
}: Props) {
  const ro = locked

  return (
    <>
      {sections.showAdditionalTests && (
        <FormSection title={labels.sectionAdditional} hazardHint={hazardHintLabels?.['additional']}>
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
    </>
  )
}

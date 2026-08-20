'use client'

import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import { Field, FormSection, FullWidth } from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

interface Props {
  values: ExaminationFormValues
  updateTop: <K extends keyof ExaminationFormValues>(
    key: K,
    value: ExaminationFormValues[K]
  ) => void
  locked: boolean
  labels: Labels
  sections: ExamSectionConfig
  examinationTypeCode: string
  defaultIntervalMonths: number
  documentsPanel?: ReactNode
  documentsSection?: ReactNode
  examinationActions?: ReactNode
}

export function VerdictStep({
  values,
  updateTop,
  locked,
  labels,
  sections,
  examinationTypeCode,
  defaultIntervalMonths,
  documentsPanel,
  documentsSection,
  examinationActions,
}: Props) {
  const ro = locked

  return (
    <>
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
                      values.verdict === v ? 'border-primary bg-primary/5' : 'border-input'
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

      {sections.showVerdict && (
        <FormSection title={labels.sectionVerdict}>
          <FullWidth>
            <div className="space-y-2">
              <Label>{labels.fieldVerdict}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const).map((v) => (
                  <label
                    key={v}
                    className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer ${
                      values.verdict === v ? 'border-primary bg-primary/5' : 'border-input'
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
                onChange={(e) => updateTop('nextExaminationDueDate', e.target.value)}
                disabled={ro}
              />
              <p className="text-xs text-muted-foreground">
                {labels.fieldNextDueDateHelp.replace('{months}', String(defaultIntervalMonths))}
              </p>
            </div>
          )}
        </FormSection>
      )}

      {documentsPanel}
      {documentsSection}

      {examinationActions && <div className="flex justify-end">{examinationActions}</div>}
    </>
  )
}

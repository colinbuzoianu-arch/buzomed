'use client'

import type { ReactNode } from 'react'
import { NonPrintingGroup, SheetMarker } from '@/components/examinations/sheet-marker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import { getSheetRef } from '@/lib/examinations/periodic-sheet-map'
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
  jobTitle?: string | null
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
  jobTitle,
  documentsPanel,
  documentsSection,
  examinationActions,
}: Props) {
  const ro = locked
  const isPeriodic = sections.showClinicalSystemsExam
  const ref = (k: string) => (isPeriodic ? getSheetRef(k) : undefined)

  return (
    <>
      {isPeriodic && <p className="text-sm text-muted-foreground">{labels.sheetStepAviz}</p>}

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
          {/* Function, read-only — comes from the employee record and prints in
              "AVIZ MEDICAL pentru exercitarea funcției de". The doctor cannot
              otherwise see it before printing. */}
          {isPeriodic && (
            <FullWidth>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Label>{labels.funcLabel}</Label>
                  <SheetMarker sheetRef={ref('employee.jobTitle')} />
                </div>
                {jobTitle ? (
                  <p className="text-sm">{jobTitle}</p>
                ) : (
                  <p className="text-sm text-amber-600">{labels.funcMissing}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {getSheetRef('employee.jobTitle')?.hint}
                </p>
              </div>
            </FullWidth>
          )}
          {/* The real consultation date. Sits at the top of the conclusion
              section because it dates the whole attestation, and because
              it has to be filled before signing — after signing it is
              immutable along with everything else. Leaving it empty keeps
              the old behaviour (the fișă shows the entry date). */}
          <div className="md:col-span-2 space-y-2">
            {isPeriodic ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="examinedAt">{labels.fieldExaminedAt}</Label>
                <SheetMarker sheetRef={ref('examinedAt')} />
              </div>
            ) : (
              <Label htmlFor="examinedAt">{labels.fieldExaminedAt}</Label>
            )}
            <Input
              id="examinedAt"
              type="date"
              value={values.examinedAt}
              onChange={(e) => updateTop('examinedAt', e.target.value)}
              disabled={ro}
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldExaminedAtHelp}
            </p>
          </div>
          <FullWidth>
            <div className="space-y-2">
              {isPeriodic ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label>{labels.fieldVerdict}</Label>
                  <SheetMarker sheetRef={ref('verdict')} />
                </div>
              ) : (
                <Label>{labels.fieldVerdict}</Label>
              )}
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
          {/* Non-periodic: original layout, unchanged. */}
          {!isPeriodic &&
            (values.verdict === 'apt' ||
              values.verdict === 'apt_conditionat' ||
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
          {!isPeriodic && values.verdict === 'inapt_temporar' && (
            <Field
              label={labels.fieldInaptTemporarUntil}
              value={values.inaptTemporarUntil}
              onChange={(v) => updateTop('inaptTemporarUntil', v)}
              type="date"
              disabled={ro}
            />
          )}
          {/* Periodic: conditions + inapt-until don't print on this sheet
              (conditions prints only on the fișă de aptitudine) — grouped. */}
          {isPeriodic &&
            (values.verdict === 'apt' ||
              values.verdict === 'apt_conditionat' ||
              values.verdict === 'inapt_temporar' ||
              values.verdict === 'inapt') && (
              <FullWidth>
                <NonPrintingGroup active heading={labels.sheetNonPrinting}>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <Field
                        label={labels.fieldVerdictConditions}
                        value={values.verdictConditions}
                        onChange={(v) => updateTop('verdictConditions', v)}
                        multiline
                        disabled={ro}
                      />
                      <p className="text-xs text-muted-foreground">
                        {getSheetRef('verdictConditions')?.hint}
                      </p>
                    </div>
                    {values.verdict === 'inapt_temporar' && (
                      <Field
                        label={labels.fieldInaptTemporarUntil}
                        value={values.inaptTemporarUntil}
                        onChange={(v) => updateTop('inaptTemporarUntil', v)}
                        type="date"
                        disabled={ro}
                      />
                    )}
                  </div>
                </NonPrintingGroup>
              </FullWidth>
            )}
          {(values.verdict === 'apt' || values.verdict === 'apt_conditionat') && (
            <div className="md:col-span-2 space-y-2">
              {isPeriodic ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="nextDue">{labels.fieldNextDueDate}</Label>
                  <SheetMarker sheetRef={ref('nextExaminationDueDate')} />
                </div>
              ) : (
                <Label htmlFor="nextDue">{labels.fieldNextDueDate}</Label>
              )}
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

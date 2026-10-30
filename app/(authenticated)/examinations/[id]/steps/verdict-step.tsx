'use client'

import type { ReactNode } from 'react'
import { NonPrintingGroup, SheetMarker } from '@/components/examinations/sheet-marker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import { getSheetRef } from '@/lib/examinations/periodic-sheet-map'
import { Field, FormSection, FullWidth } from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

/**
 * Employer-requirements panel. Neutral styling on purpose — it is NOT a
 * verdict, NOT medical, and must not look like a warning or a suggested
 * decision. The employer's request is read-only; the doctor explicitly chooses
 * whether it goes on the fișă via "Adaugă în fișă". What goes on the fișă is
 * stored SEPARATELY (employerRequirementsOnFisa) — the doctor's recommendations
 * / conditions text is never touched. Once on the fișă, the text is editable in
 * its own box and can be taken off again with "Elimină de pe fișă". The printed
 * free-text is composed from the two parts only at render time
 * (lib/examinations/compose-fisa-recommendations.ts). Nothing is auto-inserted.
 */
function EmployerRequirementsBox({
  requestText,
  onFisaValue,
  onAdd,
  onChange,
  onRemove,
  disabled,
  labels,
}: {
  /** Employer's request (snapshot), read-only. May be '' if none recorded. */
  requestText: string
  /** Current employerRequirementsOnFisa value ('' = not on the fișă). */
  onFisaValue: string
  onAdd: () => void
  onChange: (next: string) => void
  onRemove: () => void
  disabled: boolean
  labels: Labels
}) {
  const onFisa = onFisaValue.trim().length > 0
  return (
    <div className="rounded-md border border-input bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{labels.employerRequirementsTitle}</span>
        {requestText && !onFisa && (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAdd}>
            {labels.employerRequirementsAdd}
          </Button>
        )}
      </div>
      {requestText && <p className="whitespace-pre-wrap text-sm text-foreground">{requestText}</p>}
      {onFisa && (
        <div className="space-y-1 rounded-md border border-dashed border-input bg-background p-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">{labels.employerRequirementsOnFisaLabel}</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={onRemove}
            >
              {labels.employerRequirementsRemove}
            </Button>
          </div>
          <textarea
            value={onFisaValue}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">{labels.employerRequirementsPrintNote}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{labels.employerRequirementsHelp}</p>
    </div>
  )
}

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
  /** Employer's requested conditions (snapshot). Empty/absent → no box shown. */
  employerRequirements?: string | null
  preSignChecklist?: ReactNode
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
  employerRequirements,
  preSignChecklist,
  documentsPanel,
  documentsSection,
  examinationActions,
}: Props) {
  const ro = locked
  const isPeriodic = sections.showClinicalSystemsExam
  const ref = (k: string) => (isPeriodic ? getSheetRef(k) : undefined)
  const reqText = (employerRequirements ?? '').trim()
  // Show the box when there's a recorded request OR something is already on the
  // fișă (the request may have been cleared after it was added).
  const showReqBox = reqText.length > 0 || values.employerRequirementsOnFisa.trim().length > 0
  const reqBox = (
    <EmployerRequirementsBox
      requestText={reqText}
      onFisaValue={values.employerRequirementsOnFisa}
      onAdd={() => updateTop('employerRequirementsOnFisa', reqText)}
      onChange={(v) => updateTop('employerRequirementsOnFisa', v)}
      onRemove={() => updateTop('employerRequirementsOnFisa', '')}
      disabled={ro}
      labels={labels}
    />
  )

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
          {showReqBox && <FullWidth>{reqBox}</FullWidth>}
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
          {/* Employer's requested conditions — read-only; the doctor explicitly
              puts them on the fișă (stored separately, composed at print time).
              Shown regardless of the chosen verdict so the request is visible
              before deciding; nothing is ever auto-inserted. */}
          {showReqBox && <FullWidth>{reqBox}</FullWidth>}
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
          {/* Periodic: the conditions / mentions field PRINTS on the fișă de
              aptitudine (câmpul din dreapta verdictului), so it is NOT marked
              as non-printing. Only `inapt temporar până la` is dosar-only and
              stays flagged as such. (It does not print on the periodic sheet —
              the sheetMarker/hint says exactly that.) */}
          {isPeriodic &&
            (values.verdict === 'apt' ||
              values.verdict === 'apt_conditionat' ||
              values.verdict === 'inapt_temporar' ||
              values.verdict === 'inapt') && (
              <FullWidth>
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
              </FullWidth>
            )}
          {isPeriodic && values.verdict === 'inapt_temporar' && (
            <FullWidth>
              <NonPrintingGroup active heading={labels.sheetNonPrinting}>
                <Field
                  label={labels.fieldInaptTemporarUntil}
                  value={values.inaptTemporarUntil}
                  onChange={(v) => updateTop('inaptTemporarUntil', v)}
                  type="date"
                  disabled={ro}
                />
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

      {preSignChecklist}
      {examinationActions && <div className="flex justify-end">{examinationActions}</div>}
    </>
  )
}

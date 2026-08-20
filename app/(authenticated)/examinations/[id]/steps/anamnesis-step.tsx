'use client'

import { Button } from '@/components/ui/button'
import type { PrefillStatus } from '@/hooks/useExaminationPrefill'
import type { ExamSectionConfig } from '@/lib/examinations/document-templates'
import { Field, FormSection, FullWidth, getStr, SelectField } from '../examination-field-components'
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
  isHighlighted: (bucket: string, key: string) => boolean
  prefillEnabled: boolean
  prefillDismissed: boolean
  prefillStatus: PrefillStatus
  prefillCount: number
  showPrefillBanner: boolean
  onApplyPrefill: () => void
  onDismissPrefill: () => void
}

export function AnamnesisStep({
  values,
  updateJson,
  locked,
  labels,
  sections,
  isHighlighted,
  prefillEnabled,
  prefillDismissed,
  prefillStatus,
  prefillCount,
  showPrefillBanner,
  onApplyPrefill,
  onDismissPrefill,
}: Props) {
  const ro = locked

  return (
    <>
      {/* AI prefill — no prior signed exam available */}
      {prefillEnabled && !prefillDismissed && prefillStatus === 'done' && prefillCount === 0 && (
        <div className="flex items-center justify-between gap-2 border border-slate-200 bg-slate-50 rounded-md px-4 py-2.5 text-xs text-slate-500">
          <span>{labels.prefillNoData}</span>
          <button
            type="button"
            className="hover:opacity-70 leading-none"
            onClick={onDismissPrefill}
          >
            ✕
          </button>
        </div>
      )}

      {/* AI prefill banner */}
      {showPrefillBanner && (
        <div className="flex items-center justify-between gap-4 border border-blue-200 bg-blue-50 text-blue-900 rounded-md px-4 py-3 text-sm">
          {prefillStatus === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full" />
              {labels.prefillLoading}
            </span>
          ) : (
            <>
              <span>{labels.prefillReady.replace('{count}', String(prefillCount))}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Button type="button" size="sm" onClick={onApplyPrefill}>
                  {labels.prefillApply}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onDismissPrefill}>
                  {labels.prefillIgnore}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {sections.showAnamnesis && (
        <FormSection title={labels.sectionAnamnesis}>
          <FullWidth>
            <Field
              label={labels.fieldGeneralHistory}
              value={getStr(values.anamnesis, 'general')}
              onChange={(v) => updateJson('anamnesis', 'general', v)}
              multiline
              disabled={ro}
              highlighted={isHighlighted('anamnesis', 'general')}
              highlightTooltip={labels.prefillTooltip}
            />
          </FullWidth>
          <Field
            label={labels.fieldChronicConditions}
            value={getStr(values.anamnesis, 'chronicConditions')}
            onChange={(v) => updateJson('anamnesis', 'chronicConditions', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'chronicConditions')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldMedications}
            value={getStr(values.anamnesis, 'medications')}
            onChange={(v) => updateJson('anamnesis', 'medications', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'medications')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldAllergies}
            value={getStr(values.anamnesis, 'allergies')}
            onChange={(v) => updateJson('anamnesis', 'allergies', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'allergies')}
            highlightTooltip={labels.prefillTooltip}
          />
          <Field
            label={labels.fieldFamilyHistory}
            value={getStr(values.anamnesis, 'familyHistory')}
            onChange={(v) => updateJson('anamnesis', 'familyHistory', v)}
            multiline
            disabled={ro}
            highlighted={isHighlighted('anamnesis', 'familyHistory')}
            highlightTooltip={labels.prefillTooltip}
          />
          <FullWidth>
            <Field
              label={labels.fieldOccupationalHistory}
              value={getStr(values.anamnesis, 'occupationalHistory')}
              onChange={(v) => updateJson('anamnesis', 'occupationalHistory', v)}
              multiline
              disabled={ro}
              highlighted={isHighlighted('anamnesis', 'occupationalHistory')}
              highlightTooltip={labels.prefillTooltip}
            />
          </FullWidth>
          <FullWidth>
            <Field
              label={labels.fieldAdditionalNotes}
              value={getStr(values.anamnesis, 'additionalNotes')}
              onChange={(v) => updateJson('anamnesis', 'additionalNotes', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
        </FormSection>
      )}

      {/* Initial Intake — Dosar Medical (angajare only) */}
      {sections.showInitialIntake && (
        <FormSection title={labels.sectionInitialIntake}>
          <FullWidth>
            <Field
              label={labels.fieldIntakeRutaProfesionala}
              value={getStr(values.anamnesis, 'intake_ruta_profesionala')}
              onChange={(v) => updateJson('anamnesis', 'intake_ruta_profesionala', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          <Field
            label={labels.fieldIntakeMedicFamilie}
            value={getStr(values.anamnesis, 'intake_medic_familie')}
            onChange={(v) => updateJson('anamnesis', 'intake_medic_familie', v)}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeFumat}
            value={getStr(values.anamnesis, 'intake_fumat')}
            onChange={(v) => updateJson('anamnesis', 'intake_fumat', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeAlcool}
            value={getStr(values.anamnesis, 'intake_alcool')}
            onChange={(v) => updateJson('anamnesis', 'intake_alcool', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeCafea}
            value={getStr(values.anamnesis, 'intake_cafea')}
            onChange={(v) => updateJson('anamnesis', 'intake_cafea', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeDroguri}
            value={getStr(values.anamnesis, 'intake_droguri')}
            onChange={(v) => updateJson('anamnesis', 'intake_droguri', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
          <SelectField
            label={labels.fieldIntakeEnergizant}
            value={getStr(values.anamnesis, 'intake_energizant')}
            onChange={(v) => updateJson('anamnesis', 'intake_energizant', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
              { value: 'ocazional', label: labels.optOccasional },
            ]}
            disabled={ro}
          />
          <FullWidth>
            <Field
              label={labels.fieldIntakeAlergii}
              value={getStr(values.anamnesis, 'intake_alergii')}
              onChange={(v) => updateJson('anamnesis', 'intake_alergii', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          <SelectField
            label={labels.fieldIntakeSportPerformanta}
            value={getStr(values.anamnesis, 'intake_sport_performanta')}
            onChange={(v) => updateJson('anamnesis', 'intake_sport_performanta', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
          <FullWidth>
            <Field
              label={labels.fieldIntakeTratamenteUrmate}
              value={getStr(values.anamnesis, 'intake_tratamente_urmate')}
              onChange={(v) => updateJson('anamnesis', 'intake_tratamente_urmate', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          {/* Boli profesionale */}
          <FullWidth>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                label={labels.fieldIntakeBoliProfesionale}
                value={getStr(values.anamnesis, 'intake_boli_profesionale')}
                onChange={(v) => updateJson('anamnesis', 'intake_boli_profesionale', v)}
                options={[
                  { value: '', label: '—' },
                  { value: 'nu', label: labels.optNo },
                  { value: 'da', label: labels.optYes },
                ]}
                disabled={ro}
              />
              {getStr(values.anamnesis, 'intake_boli_profesionale') === 'da' && (
                <Field
                  label={labels.fieldIntakeBoliProfesionaleDiagnostic}
                  value={getStr(values.anamnesis, 'intake_boli_profesionale_diagnostic')}
                  onChange={(v) =>
                    updateJson('anamnesis', 'intake_boli_profesionale_diagnostic', v)
                  }
                  disabled={ro}
                />
              )}
            </div>
          </FullWidth>
          {/* Accidente de muncă */}
          <FullWidth>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                label={labels.fieldIntakeAccidenteMunca}
                value={getStr(values.anamnesis, 'intake_accidente_munca')}
                onChange={(v) => updateJson('anamnesis', 'intake_accidente_munca', v)}
                options={[
                  { value: '', label: '—' },
                  { value: 'nu', label: labels.optNo },
                  { value: 'da', label: labels.optYes },
                ]}
                disabled={ro}
              />
              {getStr(values.anamnesis, 'intake_accidente_munca') === 'da' && (
                <Field
                  label={labels.fieldIntakeAccidenteMuncaDiagnostic}
                  value={getStr(values.anamnesis, 'intake_accidente_munca_diagnostic')}
                  onChange={(v) => updateJson('anamnesis', 'intake_accidente_munca_diagnostic', v)}
                  disabled={ro}
                />
              )}
            </div>
          </FullWidth>
          <SelectField
            label={labels.fieldIntakeStagiuMilitar}
            value={getStr(values.anamnesis, 'intake_stagiu_militar')}
            onChange={(v) => updateJson('anamnesis', 'intake_stagiu_militar', v)}
            options={[
              { value: '', label: '—' },
              { value: 'nu', label: labels.optNo },
              { value: 'da', label: labels.optYes },
            ]}
            disabled={ro}
          />
        </FormSection>
      )}
    </>
  )
}

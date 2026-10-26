import { VerdictBadge } from '@/components/ui/verdict-badge'
import { formatDate } from '@/lib/format-date'
import { PatientContextRow } from './patient-context-panel'
import { RiskProfileRow } from './risk-profile-glance-card'

interface PriorExam {
  examinationNumber: string
  createdAt: Date
  signedAt: Date | null
  verdict: string | null
  verdictConditions: string | null
  vitalSigns: unknown
  clinicalFindings: string | null
  recommendations: string | null
  examinationType: { nameRo: string; nameEn: string | null }
}

interface WorkplaceRisk {
  riskProfile: unknown
  riskAssessmentSignedByCompany: boolean
  riskAssessmentSignedAt: Date | null
}

interface ExaminationContextCardProps {
  // Row 1 — inline facts
  requestSource: string | null
  examinationTypeName: string
  referringDocumentNumber: string | null
  workplaceName: string
  medicCurantName?: string | null
  medicCurantPhone?: string | null
  practitionerName: string
  // Row 2 — hazard profile
  workplace: WorkplaceRisk
  hazardHintLabels: Record<string, string>
  // Row 3 — prior examination (optional)
  priorExam: PriorExam | null
  locale: string
  t: (key: string) => string
}

/**
 * Compact, non-sticky context card for the examination detail page. Merges
 * the former patient-context, risk-profile and prior-exam blocks into one
 * bordered card of (up to) three thin rows, so the clinical stepper stays
 * above the fold on a laptop screen.
 */
export function ExaminationContextCard({
  requestSource,
  examinationTypeName,
  referringDocumentNumber,
  workplaceName,
  medicCurantName,
  medicCurantPhone,
  practitionerName,
  workplace,
  hazardHintLabels,
  priorExam,
  locale,
  t,
}: ExaminationContextCardProps) {
  const dateLocale = locale === 'ro' ? 'ro' : 'en'

  return (
    <div className="border border-l-2 border-l-primary/50 rounded-lg bg-card">
      {/* Row 1 — practitioner, type, workplace, motiv, document, last verdict */}
      <div className="px-4 py-2">
        <PatientContextRow
          requestSource={requestSource}
          examinationTypeName={examinationTypeName}
          referringDocumentNumber={referringDocumentNumber}
          workplaceName={workplaceName}
          priorVerdict={priorExam?.verdict ?? null}
          hasPriorExam={priorExam !== null}
          medicCurantName={medicCurantName}
          medicCurantPhone={medicCurantPhone}
          practitionerName={practitionerName}
        />
      </div>

      {/* Row 2 — declared hazards + company signature status */}
      <div className="px-4 py-2 border-t">
        <RiskProfileRow workplace={workplace} hazardHintLabels={hazardHintLabels} />
      </div>

      {/* Row 3 — prior examination, collapsed by default */}
      {priorExam && (
        <details className="border-t group">
          <summary className="flex items-center justify-between gap-2 px-4 py-2 cursor-pointer hover:bg-muted/30 select-none list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-muted-foreground shrink-0">
                {t('examinations.priorExam.title')}:
              </span>
              <span className="font-mono">#{priorExam.examinationNumber}</span>
              <span className="text-muted-foreground truncate">
                —{' '}
                {formatDate(priorExam.signedAt ?? priorExam.createdAt, 'medium', dateLocale)}
              </span>
              {!priorExam.signedAt && (
                <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-xs shrink-0">
                  {t('examinations.priorExam.draftLabel')}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              Detalii
              <span className="transition-transform group-open:rotate-180">▾</span>
            </span>
          </summary>

          <div className="px-4 pb-3 pt-2 border-t space-y-4 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {t('examinations.priorExam.typeLabel')}
                </div>
                <div>
                  {locale === 'en'
                    ? (priorExam.examinationType.nameEn ?? priorExam.examinationType.nameRo)
                    : priorExam.examinationType.nameRo}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {priorExam.signedAt
                    ? t('examinations.priorExam.signedLabel')
                    : t('examinations.priorExam.createdLabel')}
                </div>
                <div>
                  {formatDate(priorExam.signedAt ?? priorExam.createdAt, 'medium', dateLocale)}
                </div>
              </div>
              {priorExam.verdict && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {t('examinations.priorExam.verdictLabel')}
                  </div>
                  <VerdictBadge verdict={priorExam.verdict} />
                  {priorExam.verdictConditions && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {priorExam.verdictConditions}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prior vital signs */}
            {priorExam.vitalSigns != null &&
              typeof priorExam.vitalSigns === 'object' &&
              !Array.isArray(priorExam.vitalSigns) && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {t('examinations.priorExam.vitalSignsTitle')}
                  </div>
                  <PriorVitalSigns
                    vitalSigns={priorExam.vitalSigns as Record<string, unknown>}
                    t={t}
                  />
                </div>
              )}

            {priorExam.clinicalFindings && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t('examinations.form.fieldClinicalFindings')}
                </div>
                <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {priorExam.clinicalFindings}
                </div>
              </div>
            )}

            {priorExam.recommendations && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t('examinations.form.fieldRecommendations')}
                </div>
                <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {priorExam.recommendations}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function PriorVitalSigns({
  vitalSigns,
  t,
}: {
  vitalSigns: Record<string, unknown>
  t: (k: string) => string
}) {
  const num = (k: string) => {
    const v = vitalSigns[k]
    return v !== undefined && v !== null && v !== '' ? String(v) : null
  }
  const rows = [
    [t('examinations.form.fieldHeight'), num('height'), 'cm'],
    [t('examinations.form.fieldWeight'), num('weight'), 'kg'],
    [t('examinations.form.fieldBmi'), num('bmi'), ''],
    [t('examinations.form.fieldBpSystolic'), num('bpSystolic'), 'mmHg'],
    [t('examinations.form.fieldBpDiastolic'), num('bpDiastolic'), 'mmHg'],
    [t('examinations.form.fieldPulse'), num('pulse'), 'bpm'],
  ].filter(([, v]) => v !== null) as [string, string, string][]

  if (rows.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {rows.map(([label, value, unit]) => (
        <div key={label} className="flex gap-1">
          <span className="text-muted-foreground text-xs">{label}:</span>
          <span className="tabular-nums text-xs">
            {value}
            {unit && <span className="text-muted-foreground"> {unit}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

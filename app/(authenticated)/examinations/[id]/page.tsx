import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { ExaminationForm } from './examination-form'
import { DocumentsPanel } from './documents-panel'
import { ExaminationActions } from './examination-actions'
import { DocumentsSection } from '@/app/(authenticated)/_components/documents-section'
import { parseRiskProfile } from '@/lib/workplaces/risk-profile'
import { ExaminationHistorySummary } from '@/components/ai/ExaminationHistorySummary'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { formatDate } from '@/lib/format-date'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ExaminationDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params

  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      employee: true,
      workplace: {
        include: {
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: true,
      practitioner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          professionalTitle: true,
          professionalCode: true,
          signatureImageUrl: true,
        },
      },
    },
  })

  if (!examination) notFound()

  // Most recent prior examination for the same employee (excluding cancelled/no_show/this one)
  const priorExam = await prisma.examination.findFirst({
    where: {
      tenantId: user.tenantId,
      employeeId: examination.employeeId,
      id: { not: examination.id },
      status: { notIn: ['cancelled', 'no_show'] },
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      examinationNumber: true,
      createdAt: true,
      signedAt: true,
      verdict: true,
      verdictConditions: true,
      vitalSigns: true,
      clinicalFindings: true,
      recommendations: true,
      examinationType: { select: { nameRo: true, nameEn: true } },
    },
  })

  // Derive which form sections are relevant given the workplace hazard profile
  const rp = parseRiskProfile(examination.workplace.riskProfile)
  const hazardHintLabels: Record<string, string> = {}
  if (rp.physical.noise.present) {
    hazardHintLabels['hearing'] = t('examinations.form.hazardHintHearing')
  }
  if (
    rp.chemical.dust.present ||
    rp.chemical.fumes.present ||
    rp.chemical.vapors.present ||
    rp.chemical.solvents.present
  ) {
    hazardHintLabels['lung'] = t('examinations.form.hazardHintLung')
  }
  if (
    Object.values(rp.chemical).some((h) => h.present) ||
    Object.values(rp.biological).some((h) => h.present)
  ) {
    hazardHintLabels['additional'] = t('examinations.form.hazardHintAdditional')
  }

  const isSigned = examination.signedAt !== null
  const isLocked =
    isSigned ||
    examination.status === 'cancelled' ||
    examination.status === 'no_show'

  const prefillEnabled =
    !isLocked &&
    (examination.status === 'scheduled' || examination.status === 'in_progress')

  const maternityRiskLabels: Record<string, string> = {
    categoryPhysical: t('examinations.form.maternityRisk.categoryPhysical'),
    categoryBiological: t('examinations.form.maternityRisk.categoryBiological'),
    categoryChemical: t('examinations.form.maternityRisk.categoryChemical'),
    categoryWorkConditions: t('examinations.form.maternityRisk.categoryWorkConditions'),
    socuri: t('examinations.form.maternityRisk.socuri'),
    manipulareGreutati: t('examinations.form.maternityRisk.manipulareGreutati'),
    zgomot: t('examinations.form.maternityRisk.zgomot'),
    radiatiiIonizante: t('examinations.form.maternityRisk.radiatiiIonizante'),
    radiatiiNeionizante: t('examinations.form.maternityRisk.radiatiiNeionizante'),
    temperatureExtreme: t('examinations.form.maternityRisk.temperatureExtreme'),
    posturiFortat: t('examinations.form.maternityRisk.posturiFortat'),
    ortostatism: t('examinations.form.maternityRisk.ortostatism'),
    rubeola: t('examinations.form.maternityRisk.rubeola'),
    toxoplasma: t('examinations.form.maternityRisk.toxoplasma'),
    hepatitaB: t('examinations.form.maternityRisk.hepatitaB'),
    bacteriiCongenitale: t('examinations.form.maternityRisk.bacteriiCongenitale'),
    substanteR40: t('examinations.form.maternityRisk.substanteR40'),
    substanteR61: t('examinations.form.maternityRisk.substanteR61'),
    mercur: t('examinations.form.maternityRisk.mercur'),
    citostatice: t('examinations.form.maternityRisk.citostatice'),
    monoxidCarbon: t('examinations.form.maternityRisk.monoxidCarbon'),
    plumb: t('examinations.form.maternityRisk.plumb'),
    actSubterana: t('examinations.form.maternityRisk.actSubterana'),
    lucruNocturn: t('examinations.form.maternityRisk.lucruNocturn'),
  }

  const examTypeName =
    locale === 'en'
      ? examination.examinationType.nameEn ?? examination.examinationType.nameRo
      : examination.examinationType.nameRo

  // JSONB fields can be `null` even though schema defaults to {} — handle both.
  const jsonOrEmpty = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  const jsonOrEmptyArray = (v: unknown): unknown[] =>
    Array.isArray(v) ? v : []

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.examinations'), href: '/examinations' }, { label: `${examination.employee.lastName} ${examination.employee.firstName}` }]} />
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">
                {examTypeName}
              </h1>
              <span className="font-mono text-sm text-muted-foreground">
                #{examination.examinationNumber}
              </span>
            </div>
            <div className="text-muted-foreground mt-1">
              <Link
                href={`/employees/${examination.employee.id}`}
                className="hover:underline"
              >
                {examination.employee.lastName} {examination.employee.firstName}
              </Link>
              {' • '}
              <Link
                href={`/companies/${examination.workplace.company.id}/workplaces/${examination.workplace.id}`}
                className="hover:underline"
              >
                {examination.workplace.name}
              </Link>
              {' — '}
              <Link
                href={`/companies/${examination.workplace.company.id}`}
                className="hover:underline"
              >
                {examination.workplace.company.name}
              </Link>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <ExaminationStatusBadge
                status={examination.status}
                scheduledAt={examination.scheduledAt}
                startedAt={examination.startedAt}
                completedAt={examination.completedAt}
                signedAt={examination.signedAt}
                locale={locale === 'en' ? 'en' : 'ro'}
              />
              {isSigned && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-emerald-700 bg-emerald-50 border-emerald-200">
                  ✓ {t('examinations.signedBadge')}
                </span>
              )}
              {examination.scheduledAt && (
                <span className="text-muted-foreground">
                  {t('examinations.scheduledFor')}:{' '}
                  {formatDate(examination.scheduledAt, 'datetime', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
              {examination.signedAt && (
                <span className="text-muted-foreground">
                  {t('examinations.signedOn')}:{' '}
                  {formatDate(examination.signedAt, 'datetime', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isSigned && (
              <Button asChild variant="outline">
                <Link href={`/examinations/${examination.id}/fisa`}>
                  {t('examinations.viewFisa')}
                </Link>
              </Button>
            )}
            {caps.canWriteAdministrative && !isLocked && (
              <ExaminationActions
                examinationId={examination.id}
                examinationNumber={examination.examinationNumber}
                currentStatus={examination.status}
                verdictSet={examination.verdict !== null}
                canWriteClinical={caps.canWriteClinical}
                labels={{
                  start: t('examinations.actions.start'),
                  starting: t('examinations.actions.starting'),
                  cancel: t('examinations.actions.cancel'),
                  cancelConfirm: t('examinations.actions.cancelConfirm'),
                  noShow: t('examinations.actions.noShow'),
                  noShowConfirm: t('examinations.actions.noShowConfirm'),
                  sign: t('examinations.actions.sign'),
                  signing: t('examinations.actions.signing'),
                  signConfirm: t('examinations.actions.signConfirm'),
                  signRequirementsNotMet: t(
                    'examinations.actions.signRequirementsNotMet'
                  ),
                  signNote: t('examinations.actions.signNote'),
                  signNoteNoSignature: t('examinations.actions.signNoteNoSignature'),
                  errorMessage: t('examinations.form.errorMessage'),
                }}
                practitionerHasSignature={!!(examination.practitioner?.signatureImageUrl)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout: main content + AI history sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
      <div className="space-y-6 min-w-0">

      {/* Practitioner + intake metadata */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('examinations.metaSection')}</h2>
        <div className="border rounded-lg divide-y">
          <Row
            label={t('examinations.form.fieldPractitioner')}
            value={`${examination.practitioner.lastName} ${examination.practitioner.firstName}${
              examination.practitioner.professionalTitle
                ? ` (${examination.practitioner.professionalTitle})`
                : ''
            }`}
          />
          <Row
            label={t('examinations.form.fieldRequestSource')}
            value={
              examination.requestSource
                ? t(`examinations.requestSource.${examination.requestSource}`)
                : null
            }
          />
          <Row
            label={t('examinations.form.fieldReferringDocument')}
            value={examination.referringDocumentNumber}
          />
        </div>
      </section>

      {/* Prior examination panel — shown when a previous signed exam exists */}
      {priorExam && (
        <details className="border rounded-lg overflow-hidden group">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 select-none list-none">
            <span className="text-sm font-medium">
              {t('examinations.priorExam.title')}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {!priorExam.signedAt && (
                <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                  {t('examinations.priorExam.draftLabel')}
                </span>
              )}
              #{priorExam.examinationNumber}
              {' — '}
              {formatDate(priorExam.signedAt ?? priorExam.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
            </span>
          </summary>
          <div className="px-4 pb-4 pt-3 border-t space-y-4">
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
                  {formatDate(priorExam.signedAt ?? priorExam.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
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
            {priorExam.vitalSigns &&
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

      <ExaminationForm
        examinationId={examination.id}
        examinationTypeCode={examination.examinationType.code}
        locked={isLocked}
        signed={isSigned}
        prefillEnabled={prefillEnabled}
        maternityRiskLabels={maternityRiskLabels}
        initialValues={{
          // JSONB → structured form values
          anamnesis: jsonOrEmpty(examination.anamnesis),
          vitalSigns: jsonOrEmpty(examination.vitalSigns),
          visionTest: jsonOrEmpty(examination.visionTest),
          hearingTest: jsonOrEmpty(examination.hearingTest),
          lungFunction: jsonOrEmpty(examination.lungFunction),
          additionalTests: jsonOrEmpty(examination.additionalTests),
          maternityRisk: jsonOrEmpty(examination.maternityRisk),
          diagnoses: jsonOrEmptyArray(examination.diagnoses) as string[],
          clinicalFindings: examination.clinicalFindings ?? '',
          recommendations: examination.recommendations ?? '',
          notes: examination.notes ?? '',
          verdict: examination.verdict,
          verdictConditions: examination.verdictConditions ?? '',
          inaptTemporarUntil: examination.inaptTemporarUntil
            ? examination.inaptTemporarUntil.toISOString().slice(0, 10)
            : '',
          nextExaminationDueDate: examination.nextExaminationDueDate
            ? examination.nextExaminationDueDate.toISOString().slice(0, 10)
            : '',
        }}
        defaultIntervalMonths={examination.workplace.examinationIntervalMonths}
        hazardHintLabels={hazardHintLabels}
        labels={{
          sectionAnamnesis: t('examinations.form.sectionAnamnesis'),
          sectionVitalSigns: t('examinations.form.sectionVitalSigns'),
          sectionVision: t('examinations.form.sectionVision'),
          sectionHearing: t('examinations.form.sectionHearing'),
          sectionLung: t('examinations.form.sectionLung'),
          sectionAdditional: t('examinations.form.sectionAdditional'),
          sectionFindings: t('examinations.form.sectionFindings'),
          sectionVerdict: t('examinations.form.sectionVerdict'),
          fieldGeneralHistory: t('examinations.form.fieldGeneralHistory'),
          fieldChronicConditions: t('examinations.form.fieldChronicConditions'),
          fieldMedications: t('examinations.form.fieldMedications'),
          fieldAllergies: t('examinations.form.fieldAllergies'),
          fieldFamilyHistory: t('examinations.form.fieldFamilyHistory'),
          fieldOccupationalHistory: t(
            'examinations.form.fieldOccupationalHistory'
          ),
          fieldAdditionalNotes: t('examinations.form.fieldAdditionalNotes'),
          fieldHeight: t('examinations.form.fieldHeight'),
          fieldWeight: t('examinations.form.fieldWeight'),
          fieldBmi: t('examinations.form.fieldBmi'),
          fieldBpSystolic: t('examinations.form.fieldBpSystolic'),
          fieldBpDiastolic: t('examinations.form.fieldBpDiastolic'),
          fieldPulse: t('examinations.form.fieldPulse'),
          fieldVisionLeft: t('examinations.form.fieldVisionLeft'),
          fieldVisionRight: t('examinations.form.fieldVisionRight'),
          fieldVisionWithCorrection: t(
            'examinations.form.fieldVisionWithCorrection'
          ),
          fieldVisionColor: t('examinations.form.fieldVisionColor'),
          fieldHearingLeft: t('examinations.form.fieldHearingLeft'),
          fieldHearingRight: t('examinations.form.fieldHearingRight'),
          fieldLungFev1: t('examinations.form.fieldLungFev1'),
          fieldLungFvc: t('examinations.form.fieldLungFvc'),
          fieldLungRatio: t('examinations.form.fieldLungRatio'),
          fieldAdditionalLab: t('examinations.form.fieldAdditionalLab'),
          fieldAdditionalImaging: t('examinations.form.fieldAdditionalImaging'),
          fieldAdditionalOther: t('examinations.form.fieldAdditionalOther'),
          fieldClinicalFindings: t('examinations.form.fieldClinicalFindings'),
          fieldDiagnoses: t('examinations.form.fieldDiagnoses'),
          fieldDiagnosesHelp: t('examinations.form.fieldDiagnosesHelp'),
          fieldRecommendations: t('examinations.form.fieldRecommendations'),
          fieldNotes: t('examinations.form.fieldNotes'),
          fieldVerdict: t('examinations.form.fieldVerdict'),
          fieldVerdictApt: t('examinations.form.verdict.apt'),
          fieldVerdictAptConditionat: t(
            'examinations.form.verdict.apt_conditionat'
          ),
          fieldVerdictInaptTemporar: t(
            'examinations.form.verdict.inapt_temporar'
          ),
          fieldVerdictInapt: t('examinations.form.verdict.inapt'),
          fieldVerdictConditions: t('examinations.form.fieldVerdictConditions'),
          fieldInaptTemporarUntil: t(
            'examinations.form.fieldInaptTemporarUntil'
          ),
          fieldNextDueDate: t('examinations.form.fieldNextDueDate'),
          fieldNextDueDateHelp: t('examinations.form.fieldNextDueDateHelp'),
          saveButton: t('examinations.form.saveButton'),
          saving: t('examinations.form.saving'),
          savedToast: t('examinations.form.savedToast'),
          signedNotice: t('examinations.form.signedNotice'),
          errorMessage: t('examinations.form.errorMessage'),
          // Initial intake
          sectionInitialIntake: t('examinations.form.sectionInitialIntake'),
          fieldIntakeRutaProfesionala: t('examinations.form.fieldIntakeRutaProfesionala'),
          fieldIntakeMedicFamilie: t('examinations.form.fieldIntakeMedicFamilie'),
          fieldIntakeFumat: t('examinations.form.fieldIntakeFumat'),
          fieldIntakeAlcool: t('examinations.form.fieldIntakeAlcool'),
          fieldIntakeCafea: t('examinations.form.fieldIntakeCafea'),
          fieldIntakeDroguri: t('examinations.form.fieldIntakeDroguri'),
          fieldIntakeEnergizant: t('examinations.form.fieldIntakeEnergizant'),
          fieldIntakeAlergii: t('examinations.form.fieldIntakeAlergii'),
          fieldIntakeSportPerformanta: t('examinations.form.fieldIntakeSportPerformanta'),
          fieldIntakeTratamenteUrmate: t('examinations.form.fieldIntakeTratamenteUrmate'),
          fieldIntakeBoliProfesionale: t('examinations.form.fieldIntakeBoliProfesionale'),
          fieldIntakeBoliProfesionaleDiagnostic: t('examinations.form.fieldIntakeBoliProfesionaleDiagnostic'),
          fieldIntakeAccidenteMunca: t('examinations.form.fieldIntakeAccidenteMunca'),
          fieldIntakeAccidenteMuncaDiagnostic: t('examinations.form.fieldIntakeAccidenteMuncaDiagnostic'),
          fieldIntakeStagiuMilitar: t('examinations.form.fieldIntakeStagiuMilitar'),
          optYes: t('examinations.form.optYes'),
          optNo: t('examinations.form.optNo'),
          optOccasional: t('examinations.form.optOccasional'),
          // Maternity risk
          sectionMaternityRisk: t('examinations.form.sectionMaternityRisk'),
          // Certificate
          sectionCertificate: t('examinations.form.sectionCertificate'),
          certApt: t('examinations.form.certApt'),
          certInapt: t('examinations.form.certInapt'),
          certAptConditionat: t('examinations.form.certAptConditionat'),
          certInaptTemporar: t('examinations.form.certInaptTemporar'),
          // AI prefill
          prefillLoading: t('examinations.form.prefillLoading'),
          prefillReady: t('examinations.form.prefillReady'),
          prefillApply: t('examinations.form.prefillApply'),
          prefillIgnore: t('examinations.form.prefillIgnore'),
          prefillTooltip: t('examinations.form.prefillTooltip'),
        }}
      />

      {/* Generated document templates for this examination type */}
      <DocumentsPanel
        examinationTypeCode={examination.examinationType.code}
        examinationId={examination.id}
        employeeFullName={`${examination.employee.lastName} ${examination.employee.firstName}`}
        locked={isLocked}
        isCancelled={examination.status === 'cancelled' || examination.status === 'no_show'}
        labels={{
          title: t('examinations.documentsPanel.title'),
          downloadBlank: t('examinations.documentsPanel.downloadBlank'),
          generateFilled: t('examinations.documentsPanel.generateFilled'),
          generateFilledTooltip: t('examinations.documentsPanel.generateFilledTooltip'),
          generating: t('examinations.documentsPanel.generating'),
          unsignedWarning: t('examinations.documentsPanel.unsignedWarning'),
          badgeRequired: t('examinations.documentsPanel.badgeRequired'),
          badgeOptional: t('examinations.documentsPanel.badgeOptional'),
        }}
      />

      {/* Uploaded documents — session 7 */}
      <DocumentsSection
        entityType="examination"
        entityId={examination.id}
        tenantId={user.tenantId}
        canWrite={caps.canWriteAdministrative}
        locale={locale}
      />

      </div>{/* end main column */}

      {/* Sidebar */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <ExaminationHistorySummary
          currentExaminationId={examination.id}
          employeeId={examination.employeeId}
        />
      </aside>

      </div>{/* end grid */}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="md:col-span-2 text-sm">
        {value && value !== '' ? value : '—'}
      </div>
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


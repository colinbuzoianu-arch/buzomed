import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { ExaminationForm } from './examination-form'
import { ExaminationActions } from './examination-actions'

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
        },
      },
    },
  })

  if (!examination) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )
  const dateTimeFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' }
  )

  const isSigned = examination.signedAt !== null
  const isLocked =
    isSigned ||
    examination.status === 'cancelled' ||
    examination.status === 'no_show'

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
        <Link
          href="/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('examinations.backToList')}
        </Link>
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
              <StatusBadge status={examination.status} t={t} />
              {isSigned && (
                <span className="inline-block px-2 py-0.5 rounded text-xs border text-green-700 bg-green-50 border-green-200">
                  ✓ {t('examinations.signedBadge')}
                </span>
              )}
              {examination.scheduledAt && (
                <span className="text-muted-foreground">
                  {t('examinations.scheduledFor')}:{' '}
                  {dateTimeFormatter.format(examination.scheduledAt)}
                </span>
              )}
              {examination.signedAt && (
                <span className="text-muted-foreground">
                  {t('examinations.signedOn')}:{' '}
                  {dateTimeFormatter.format(examination.signedAt)}
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
            {caps.canWrite && !isLocked && (
              <ExaminationActions
                examinationId={examination.id}
                currentStatus={examination.status}
                verdictSet={examination.verdict !== null}
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
                  errorMessage: t('examinations.form.errorMessage'),
                }}
              />
            )}
          </div>
        </div>
      </div>

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

      <ExaminationForm
        examinationId={examination.id}
        locked={isLocked}
        signed={isSigned}
        initialValues={{
          // JSONB → structured form values
          anamnesis: jsonOrEmpty(examination.anamnesis),
          vitalSigns: jsonOrEmpty(examination.vitalSigns),
          visionTest: jsonOrEmpty(examination.visionTest),
          hearingTest: jsonOrEmpty(examination.hearingTest),
          lungFunction: jsonOrEmpty(examination.lungFunction),
          additionalTests: jsonOrEmpty(examination.additionalTests),
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
        }}
      />
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

function StatusBadge({
  status,
  t,
}: {
  status: string
  t: (k: string) => string
}) {
  const colors: Record<string, string> = {
    scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
    in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
    completed: 'text-green-700 bg-green-50 border-green-200',
    cancelled: 'text-muted-foreground bg-muted border-muted',
    no_show: 'text-muted-foreground bg-muted border-muted',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs border ${
        colors[status] ?? colors.cancelled
      }`}
    >
      {t(`examinations.status.${status}`)}
    </span>
  )
}

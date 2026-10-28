'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import { DocumentsPanel } from '@/app/(authenticated)/examinations/[id]/documents-panel'
import { ExaminationActions } from '@/app/(authenticated)/examinations/[id]/examination-actions'
import { ExaminationStepper } from '@/app/(authenticated)/examinations/[id]/examination-stepper'
import { RevokeFisaDialog } from '@/app/(authenticated)/examinations/[id]/revoke-fisa-dialog'
import { ExaminationContextCard } from '@/components/examinations/examination-context-card'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Button } from '@/components/ui/button'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { formatDate } from '@/lib/format-date'
import { buildStepperLabels, deriveExamDetail } from '@/lib/sandbox/examination-detail'
import { sandboxT as t } from '@/lib/sandbox/i18n'
import { useSandboxStore } from '@/lib/sandbox/store'

export default function SandboxExaminationDetailPage() {
  // The reused stepper calls useSearchParams → needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ExaminationDetailInner />
    </Suspense>
  )
}

function ExaminationDetailInner() {
  const params = useParams<{ id: string }>()
  const { data } = useSandboxStore()
  const id = params.id

  const detail = deriveExamDetail(data, id)
  if (!detail) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: t('nav.examinations'), href: '/sandbox/examinations' }, { label: '—' }]}
        />
        <p className="text-muted-foreground">Examinarea nu a fost găsită în demo.</p>
        <Button asChild variant="outline">
          <Link href="/sandbox/examinations">← {t('nav.examinations')}</Link>
        </Button>
      </div>
    )
  }

  const {
    exam,
    employee,
    workplace,
    company,
    examTypeName,
    practitionerName,
    priorExam,
    isSigned,
    isRevoked,
    isLocked,
    canRevoke,
    revokeCandidates,
    supersededBy,
    hazardHintLabels,
    dosarIdentity,
    initialValues,
  } = detail

  const labels = buildStepperLabels(exam.examinationTypeCode)

  const examinationActions = !isLocked ? (
    <ExaminationActions
      examinationId={exam.id}
      examinationNumber={exam.examinationNumber}
      currentStatus={exam.status}
      verdictSet={exam.verdict !== null}
      examinedAtSet={exam.examinedAt !== null}
      inaptTemporarUntilMissing={
        exam.verdict === 'inapt_temporar' && exam.inaptTemporarUntil === null
      }
      canWriteClinical
      practitionerHasSignature
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
        signRequirementsNotMet: t('examinations.actions.signRequirementsNotMet'),
        signNote: t('examinations.actions.signNote'),
        signNoteNoSignature: t('examinations.actions.signNoteNoSignature'),
        signTodoIntro: t('examinations.actions.signTodoIntro'),
        signNeedsVerdict: t('examinations.actions.signNeedsVerdict'),
        signNeedsExamDate: t('examinations.actions.signNeedsExamDate'),
        signNeedsInaptUntil: t('examinations.actions.signNeedsInaptUntil'),
        signBlockedStatus: t('examinations.actions.signBlockedStatus'),
        errorMessage: t('examinations.form.errorMessage'),
      }}
    />
  ) : null

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.examinations'), href: '/sandbox/examinations' },
            { label: `${employee.lastName} ${employee.firstName}` },
          ]}
        />
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{examTypeName}</h1>
              <span className="font-mono text-sm text-muted-foreground">
                #{exam.examinationNumber}
              </span>
            </div>
            <div className="text-muted-foreground mt-1">
              <span>
                {employee.lastName} {employee.firstName}
              </span>
              {' • '}
              <span>{workplace.name}</span>
              {' — '}
              <span>{company.name}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <ExaminationStatusBadge
                status={exam.status}
                scheduledAt={exam.scheduledAt}
                startedAt={exam.startedAt}
                completedAt={exam.completedAt}
                signedAt={exam.signedAt}
                locale="ro"
              />
              {isSigned && !isRevoked && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-emerald-700 bg-emerald-50 border-emerald-200">
                  ✓ {t('examinations.signedBadge')}
                </span>
              )}
              {isRevoked && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-red-700 bg-red-50 border-red-200">
                  {t('examinations.revoke.badge')}
                </span>
              )}
              {exam.scheduledAt && (
                <span className="text-muted-foreground">
                  {t('examinations.scheduledFor')}: {formatDate(exam.scheduledAt, 'datetime', 'ro')}
                </span>
              )}
              {exam.signedAt && (
                <span className="text-muted-foreground">
                  {t('examinations.signedOn')}: {formatDate(exam.signedAt, 'datetime', 'ro')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isSigned && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/examinations/${exam.id}/fisa-pdf`, '_blank')}
              >
                {t('examinations.viewFisa')}
              </Button>
            )}
            {canRevoke && (
              <RevokeFisaDialog
                examinationId={exam.id}
                candidates={revokeCandidates}
                minReasonLength={10}
                labels={{
                  button: t('examinations.revoke.button'),
                  dialogTitle: t('examinations.revoke.dialogTitle'),
                  dialogIntro: t('examinations.revoke.dialogIntro'),
                  reasonLabel: t('examinations.revoke.reasonLabel'),
                  reasonPlaceholder: t('examinations.revoke.reasonPlaceholder'),
                  reasonTooShort: t('examinations.revoke.reasonTooShort'),
                  supersededByLabel: t('examinations.revoke.supersededByLabel'),
                  supersededByNone: t('examinations.revoke.supersededByNone'),
                  confirm: t('examinations.revoke.confirm'),
                  cancel: t('examinations.revoke.cancel'),
                  submitting: t('examinations.revoke.submitting'),
                  error: t('examinations.revoke.error'),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {isRevoked && exam.revokedAt && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">
            {t('examinations.revoke.revokedNoticeTitle')}
          </h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="inline text-red-900/70">{t('examinations.fisa.revokedAtLabel')}: </dt>
              <dd className="inline text-red-900">
                {formatDate(exam.revokedAt, 'datetime', 'ro')}
              </dd>
            </div>
            {supersededBy && (
              <div>
                <dt className="inline text-red-900/70">
                  {t('examinations.fisa.supersededByLabel')}:{' '}
                </dt>
                <dd className="inline">
                  <Link
                    href={`/sandbox/examinations/${supersededBy.id}`}
                    className="font-mono text-red-900 underline"
                  >
                    #{supersededBy.examinationNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
          {exam.revocationReason && (
            <p className="mt-2 text-sm text-red-900">
              <span className="text-red-900/70">
                {t('examinations.fisa.revocationReasonLabel')}:{' '}
              </span>
              {exam.revocationReason}
            </p>
          )}
        </div>
      )}

      <ExaminationContextCard
        requestSource={null}
        examinationTypeName={examTypeName}
        referringDocumentNumber={null}
        workplaceName={workplace.name}
        medicCurantName={null}
        medicCurantPhone={null}
        practitionerName={practitionerName}
        workplace={{
          riskProfile: workplace.riskProfile,
          riskAssessmentSignedByCompany: true,
          riskAssessmentSignedAt: company.createdAt,
        }}
        hazardHintLabels={hazardHintLabels}
        priorExam={priorExam}
        locale="ro"
        t={t}
      />

      <ExaminationStepper
        examinationId={exam.id}
        employeeId={exam.employeeId}
        examinationTypeCode={exam.examinationTypeCode}
        locked={isLocked}
        signed={isSigned}
        prefillEnabled={false}
        maternityRiskLabels={{}}
        initialValues={initialValues}
        defaultIntervalMonths={workplace.examinationIntervalMonths}
        jobTitle={employee.jobTitle}
        employeeHasCnp={!!employee.cnp}
        companyAddressPresent
        employeeEditHref="/sandbox/employees"
        companyEditHref="/sandbox/companies"
        dosarIdentity={dosarIdentity}
        hazardHintLabels={hazardHintLabels}
        labels={labels}
        documentsPanel={
          <DocumentsPanel
            examinationTypeCode={exam.examinationTypeCode}
            examinationId={exam.id}
            employeeFullName={`${employee.lastName} ${employee.firstName}`}
            locked={isLocked}
            isCancelled={exam.status === 'cancelled' || exam.status === 'no_show'}
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
        }
        documentsSection={null}
        examinationActions={examinationActions}
        viewSheetNote="În demo se deschide o foaie exemplu."
      />
    </div>
  )
}

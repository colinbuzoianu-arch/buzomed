import { Building2 } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { DocumentsSection } from '@/app/(authenticated)/_components/documents-section'
import { EmployeeProfileSummary } from '@/components/ai/EmployeeProfileSummary'
import { computeEmployeeStatus, type EmployeeStatusKind } from '@/components/employees/employee-status'
import { MedicalEventsTab } from '@/components/employees/medical-events-tab'
import { RetentionOverrideButton } from '@/components/employees/retention-override-button'
import { VaccinationsTab } from '@/components/employees/vaccinations-tab'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { requireUser } from '@/lib/auth'
import { decryptCnp } from '@/lib/crypto/cnp-cipher'
import { maskCnp } from '@/lib/crypto/cnp-validation'
import { formatDate } from '@/lib/format-date'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'
import { EmployeeAssignmentManager } from './assignment-manager'
import { CnpReveal } from './cnp-reveal'
import { EmployeeActions } from './employee-actions'

const VALID_TABS = ['dosar', 'avize', 'ruta', 'vaccinations', 'medical-events', 'documents', 'personal'] as const
type EmployeeTab = (typeof VALID_TABS)[number]

const DOSAR_PAGE_SIZE = 50

// Filled status-pill classes per kind (header).
const PILL_CLS: Record<EmployeeStatusKind, string> = {
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  never: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; dp?: string }>
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export default async function EmployeeDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)
  const loc = locale === 'ro' ? 'ro' : 'en'

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params
  const sp = await searchParams
  const activeTab: EmployeeTab = VALID_TABS.includes(sp.tab as EmployeeTab) ? (sp.tab as EmployeeTab) : 'dosar'

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  })
  if (!employee) notFound()

  const tenantRetentionYears =
    (await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { dataRetentionYears: true } }))
      ?.dataRetentionYears ?? 7

  const [assignmentRows, workplaceOptions, allExams, openRecall] = await Promise.all([
    prisma.employeeWorkplaceAssignment.findMany({
      where: { employeeId: id, tenantId: user.tenantId },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
      include: {
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            companyId: true,
            riskProfile: true,
            company: { select: { id: true, name: true } },
            workSite: { select: { name: true } },
          },
        },
      },
    }),
    prisma.workplace.findMany({
      where: {
        tenantId: user.tenantId,
        ...(employee.companyId ? { companyId: employee.companyId } : {}),
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        department: true,
        company: { select: { name: true } },
        workSite: { select: { name: true } },
      },
    }),
    prisma.examination.findMany({
      where: { employeeId: id, tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ signedAt: 'desc' }, { completedAt: 'desc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        examinationNumber: true,
        status: true,
        verdict: true,
        verdictConditions: true,
        signedAt: true,
        scheduledAt: true,
        completedAt: true,
        createdAt: true,
        revokedAt: true,
        nextExaminationDueDate: true,
        anamnesis: true,
        examinationType: { select: { nameRo: true, nameEn: true } },
        practitioner: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.recall.findFirst({
      where: {
        employeeId: id,
        tenantId: user.tenantId,
        deletedAt: null,
        status: { in: ['pending', 'scheduled', 'overdue'] },
      },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true, status: true },
    }),
  ])

  const isArchived = employee.archivedAt !== null
  const currentAssignment = assignmentRows.find((a) => a.isCurrent) ?? null
  const historyAssignments = assignmentRows.filter((a) => !a.isCurrent)

  // ── Status pill (same classification as the employees list) ─────────────────
  const hasExam = allExams.some((e) => e.status === 'completed')
  const status = computeEmployeeStatus(
    {
      recall: openRecall
        ? { dueDate: openRecall.dueDate.toISOString().slice(0, 10), status: openRecall.status }
        : null,
      hasExam,
    }
  )
  const pillText =
    status.kind === 'overdue'
      ? t('employees.statusPill.overdue').replace('{n}', String(status.days))
      : status.kind === 'soon'
        ? t('employees.statusPill.soon').replace('{n}', String(status.days))
        : status.kind === 'ok'
          ? t('employees.statusPill.ok').replace('{month}', status.month)
          : status.kind === 'never'
            ? t('employees.statusPill.never')
            : t('employees.statusPill.none')

  // ── Summary strip data ──────────────────────────────────────────────────────
  const lastAviz = allExams.find((e) => e.signedAt && !e.revokedAt && e.verdict) ?? null
  const lastFisa = allExams.find((e) => e.signedAt && !e.revokedAt) ?? null
  const latestAnamnesis = (allExams[0]?.anamnesis ?? {}) as Record<string, unknown>
  const allergies = str(latestAnamnesis.allergies)
  const chronic = str(latestAnamnesis.chronicConditions)
  const chronicCount = chronic ? chronic.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length : 0

  const currentRisks: string[] = []
  if (currentAssignment) {
    const rp = parseRiskProfile(currentAssignment.workplace.riskProfile)
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (entry?.present) currentRisks.push(t(`workplaces.form.hazardName.${hazardKey}`))
      }
    }
  }

  // ── CNP display (unchanged) ──────────────────────────────────────────────────
  let cnpPlaintext: string | null = null
  let cnpMaskedDisplay: string | null = null
  let cnpDecryptError = false
  if (employee.idDocumentType === 'cnp' && employee.cnpEncrypted) {
    if (caps.canViewSensitivePii) {
      try {
        cnpPlaintext = decryptCnp(employee.cnpEncrypted)
        cnpMaskedDisplay = maskCnp(cnpPlaintext)
      } catch (err) {
        console.error('[employees.detail] CNP decrypt failed', err)
        cnpDecryptError = true
      }
    } else {
      cnpMaskedDisplay = '•••'
    }
  }

  const idDocumentTypeLabel: Record<string, string> = {
    cnp: t('employees.form.fieldIdDocumentTypeCnp'),
    passport: t('employees.form.fieldIdDocumentTypePassport'),
    eu_id_card: t('employees.form.fieldIdDocumentTypeEuId'),
    other: t('employees.form.fieldIdDocumentTypeOther'),
  }

  const sections = [
    {
      title: t('employees.form.sectionIdentity'),
      rows: [
        [t('employees.form.fieldLastName'), employee.lastName],
        [t('employees.form.fieldFirstName'), employee.firstName],
        [t('employees.form.fieldJobTitle'), employee.jobTitle],
        [t('employees.form.fieldIdDocumentType'), idDocumentTypeLabel[employee.idDocumentType] ?? employee.idDocumentType],
        [employee.idDocumentType === 'cnp' ? t('employees.form.fieldCnp') : t('employees.form.fieldIdDocumentNumber'), null],
        [t('employees.form.fieldCompanyEmployeeId'), employee.companyEmployeeId],
        [t('employees.form.fieldBirthDate'), employee.birthDate ? formatDate(employee.birthDate, 'medium', loc) : null],
        [t('employees.form.fieldGender'), employee.gender],
        [t('employees.form.fieldNationality'), employee.nationality],
      ],
    },
    {
      title: t('employees.form.sectionContact'),
      rows: [
        [t('employees.form.fieldAddress1'), employee.addressLine1],
        [t('employees.form.fieldAddress2'), employee.addressLine2],
        [t('common.city'), employee.city],
        [t('common.county'), employee.county],
        [t('common.postalCode'), employee.postalCode],
        [t('common.phone'), employee.phone],
        [t('common.email'), employee.email],
      ],
    },
    {
      title: t('employees.form.sectionEmergency'),
      rows: [
        [t('employees.form.fieldEmergencyName'), employee.emergencyContactName],
        [t('employees.form.fieldEmergencyPhone'), employee.emergencyContactPhone],
        [t('employees.form.fieldEmergencyRelationship'), employee.emergencyContactRelationship],
      ],
    },
    {
      title: t('employees.form.sectionMedical'),
      rows: [
        [t('employees.form.fieldBloodType'), employee.bloodType],
        ...(employee.disabilityDegree
          ? [[t('employees.form.fieldDisabilityDegree'), t(`employees.form.fieldDisabilityDegreeOptions.${employee.disabilityDegree}`)]]
          : []),
        [t('employees.form.fieldNotes'), employee.notes],
      ],
    },
  ] as const

  const examTypeName = (e: (typeof allExams)[number]) =>
    locale === 'en' ? (e.examinationType.nameEn ?? e.examinationType.nameRo) : e.examinationType.nameRo
  const practitionerName = (e: (typeof allExams)[number]) =>
    e.practitioner ? `${e.practitioner.lastName} ${e.practitioner.firstName}` : null

  // Dosar pagination
  const dp = Math.max(1, Number.parseInt(sp.dp ?? '1', 10) || 1)
  const dosarTotalPages = Math.ceil(allExams.length / DOSAR_PAGE_SIZE)
  const dosarPageExams = allExams.slice((dp - 1) * DOSAR_PAGE_SIZE, dp * DOSAR_PAGE_SIZE)

  const avize = allExams.filter((e) => e.signedAt && e.verdict)

  const tabHref = (tab: EmployeeTab) => `/employees/${employee.id}?tab=${tab}`

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <Breadcrumbs items={[{ label: t('nav.employees'), href: '/employees' }, { label: `${employee.lastName} ${employee.firstName}` }]} />
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{employee.lastName} {employee.firstName}</h1>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${PILL_CLS[status.kind]}`}>
                {pillText}
              </span>
              {isArchived && (
                <span className="inline-flex items-center gap-1.5 text-sm text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {t('employees.archived')}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {employee.company && (
                <Link href={`/companies/${employee.company.id}`} className="hover:underline">
                  {employee.company.name}
                </Link>
              )}
              {employee.jobTitle && <span> · {employee.jobTitle}</span>}
              {currentAssignment && (
                <span>
                  {' · '}
                  <Link
                    href={`/companies/${currentAssignment.workplace.companyId}/workplaces/${currentAssignment.workplace.id}`}
                    className="hover:underline"
                  >
                    {formatWorkplaceLabel(currentAssignment.workplace)}
                  </Link>
                </span>
              )}
              {employee.companyEmployeeId && (
                <span className="text-[hsl(var(--text-faint))] font-mono"> · #{employee.companyEmployeeId}</span>
              )}
            </div>
          </div>

          {caps.canWriteAdministrative && (
            <div className="flex items-center gap-2 flex-wrap">
              {!isArchived && currentAssignment && (
                <Button asChild>
                  <Link href={`/examinations/new?employeeId=${employee.id}`}>+ {t('employees.newExaminationButton')}</Link>
                </Button>
              )}
              {lastFisa && (
                <Button asChild variant="outline">
                  <a href={`/api/examinations/${lastFisa.id}/fisa-pdf`} download>
                    {t('employees.detail.lastFisa')}
                  </a>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/employees/${employee.id}/edit`}>{t('common.edit')}</Link>
              </Button>
              <a
                href={`/api/employees/${employee.id}/gdpr-export`}
                download
                className="inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted transition-colors text-muted-foreground"
                title="Export date personale (GDPR Art. 20)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <path d="M6 1v7m0 0L3.5 5.5M6 8l2.5-2.5M1 10h10" />
                </svg>
                GDPR Export
              </a>
              <EmployeeActions
                employeeId={employee.id}
                employeeName={`${employee.lastName} ${employee.firstName}`}
                isArchived={isArchived}
                labels={{
                  archive: t('employees.archive'),
                  archiving: t('employees.archiving'),
                  archiveConfirm: t('employees.archiveConfirm'),
                  archiveDialogTitle: t('employees.archiveDialogTitle'),
                  archiveReasonLabel: t('employees.archiveReasonLabel'),
                  archiveReasons: {
                    left_employment: t('employees.archivedReason.left_employment'),
                    retired: t('employees.archivedReason.retired'),
                    deceased: t('employees.archivedReason.deceased'),
                    transferred: t('employees.archivedReason.transferred'),
                    other: t('employees.archivedReason.other'),
                  },
                  unarchive: t('employees.unarchive'),
                  unarchiveConfirm: t('employees.unarchiveConfirm'),
                  delete: t('common.delete'),
                  deleteConfirm: t('employees.deleteConfirm'),
                  deleting: t('employees.deleting'),
                  cancel: t('common.cancel'),
                  errorMessage: t('employees.form.errorMessage'),
                  submit: t('common.save'),
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StripTile label={t('employees.summary.lastVerdict')}>
          {lastAviz?.verdict ? (
            <div className="space-y-1">
              <VerdictBadge verdict={lastAviz.verdict} />
              <div className="text-xs text-muted-foreground">
                {lastAviz.signedAt && formatDate(lastAviz.signedAt, 'medium', loc)}
                {practitionerName(lastAviz) && <> · {practitionerName(lastAviz)}</>}
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </StripTile>
        <StripTile label={t('employees.summary.nextControl')}>
          <span className="text-sm font-medium">
            {openRecall ? formatDate(openRecall.dueDate, 'medium', loc) : '—'}
          </span>
        </StripTile>
        <StripTile label={t('employees.summary.risks')}>
          {currentRisks.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {currentRisks.slice(0, 4).map((r) => (
                <span key={r} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {r}
                </span>
              ))}
              {currentRisks.length > 4 && (
                <span className="text-[11px] text-muted-foreground">+{currentRisks.length - 4}</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </StripTile>
        <StripTile label={t('employees.summary.cautions')}>
          {allergies ? (
            <span className="text-sm font-medium text-red-700 dark:text-red-300" title={allergies}>
              {allergies.length > 40 ? `${allergies.slice(0, 39)}…` : allergies}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </StripTile>
        <StripTile label={t('employees.summary.chronic')}>
          {chronicCount > 0 ? (
            <span className="text-sm font-medium" title={chronic}>
              {chronicCount}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </StripTile>
      </div>

      {/* ── Tabs + AI sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <div className="flex gap-1 border-b overflow-x-auto">
            {(
              [
                ['dosar', t('employees.detailTabs.dosar')],
                ['avize', t('employees.detailTabs.avize')],
                ['ruta', t('employees.detailTabs.ruta')],
                ['vaccinations', t('employees.profileTabs.vaccinations')],
                ['medical-events', t('employees.profileTabs.medicalEvents')],
                ['documents', t('employees.profileTabs.documents')],
                ['personal', t('employees.detailTabs.personal')],
              ] as [EmployeeTab, string][]
            ).map(([key, label]) => (
              <Link
                key={key}
                href={tabHref(key)}
                className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* ── Dosar: full examination timeline ── */}
          {activeTab === 'dosar' && (
            <section className="space-y-3">
              {allExams.length === 0 ? (
                <EmptyState size="compact" illustration="examinations" title={t('employees.noExaminations')} />
              ) : (
                <>
                  <ol className="border rounded-lg divide-y">
                    {dosarPageExams.map((e) => {
                      const date = e.signedAt ?? e.completedAt ?? e.scheduledAt ?? e.createdAt
                      const statusLabel = e.revokedAt
                        ? t('employees.detail.revoked')
                        : e.signedAt
                          ? t('employees.detail.signed')
                          : t(`examinations.status.${e.status}`)
                      return (
                        <li key={e.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm tabular-nums text-muted-foreground">
                                  {date ? formatDate(date, 'medium', loc) : '—'}
                                </span>
                                <Link href={`/examinations/${e.id}`} className="text-sm font-medium hover:underline truncate">
                                  {examTypeName(e)}
                                </Link>
                                {e.verdict && <VerdictBadge verdict={e.verdict} />}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                <span className={e.revokedAt ? 'text-red-700 dark:text-red-300 font-medium' : ''}>{statusLabel}</span>
                                {practitionerName(e) && <> · {practitionerName(e)}</>}
                                <span className="font-mono"> · {e.examinationNumber}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Link href={`/examinations/${e.id}`} className="text-xs text-primary hover:underline">
                                {t('employees.detail.openExam')}
                              </Link>
                              {e.signedAt && (
                                <a
                                  href={`/api/examinations/${e.id}/fisa-pdf`}
                                  download
                                  title={t('employees.downloadFisaTitle')}
                                  aria-label={t('employees.downloadFisaTitle')}
                                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden role="img">
                                    <title>{t('employees.downloadFisaTitle')}</title>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  {dosarTotalPages > 1 && (
                    <Pagination href={`/employees/${employee.id}`} params={{ tab: 'dosar' }} paramName="dp" page={dp} totalPages={dosarTotalPages} />
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Avize: signed exams with a verdict ── */}
          {activeTab === 'avize' && (
            <section className="space-y-3">
              {avize.length === 0 ? (
                <EmptyState size="compact" illustration="examinations" title={t('employees.noExaminations')} />
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-2">{t('employees.avize.nr')}</th>
                        <th className="text-left px-4 py-2">{t('employees.avize.date')}</th>
                        <th className="text-left px-4 py-2">{t('employees.avize.type')}</th>
                        <th className="text-left px-4 py-2">{t('employees.avize.verdict')}</th>
                        <th className="text-left px-4 py-2">{t('employees.avize.conditions')}</th>
                        <th className="text-left px-4 py-2">{t('employees.avize.validUntil')}</th>
                        <th className="text-right px-4 py-2">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {avize.map((e) => (
                        <tr key={e.id} className={e.revokedAt ? 'text-muted-foreground line-through' : ''}>
                          <td className="px-4 py-2 font-mono text-xs">
                            <Link href={`/examinations/${e.id}`} className="hover:underline">{e.examinationNumber}</Link>
                          </td>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap">{e.signedAt && formatDate(e.signedAt, 'medium', loc)}</td>
                          <td className="px-4 py-2">{examTypeName(e)}</td>
                          <td className="px-4 py-2">
                            {e.verdict && <VerdictBadge verdict={e.verdict} />}
                            {e.revokedAt && <span className="ml-1.5 text-[11px] text-red-700 no-underline">({t('employees.detail.revoked')})</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{e.verdictConditions || '—'}</td>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                            {e.nextExaminationDueDate ? formatDate(e.nextExaminationDueDate, 'medium', loc) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {e.signedAt && (
                              <a href={`/api/examinations/${e.id}/fisa-pdf`} download className="text-primary hover:underline no-underline">PDF</a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Rută profesională: workplace assignments ── */}
          {activeTab === 'ruta' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('employees.assignments.sectionTitle')}</h2>
                {caps.canWriteAdministrative && !isArchived && (
                  <EmployeeAssignmentManager
                    employeeId={employee.id}
                    currentAssignmentId={currentAssignment?.id ?? null}
                    workplaces={workplaceOptions.map((w) => ({ id: w.id, name: formatWorkplaceLabel(w), department: w.department, companyName: w.company.name }))}
                    labels={{
                      assignButton: t('employees.assignments.assignButton'),
                      reassignButton: t('employees.assignments.reassignButton'),
                      endButton: t('employees.assignments.endButton'),
                      ending: t('employees.assignments.ending'),
                      dialogAssignTitle: t('employees.assignments.dialogAssignTitle'),
                      dialogReassignTitle: t('employees.assignments.dialogReassignTitle'),
                      dialogAssignDescription: t('employees.assignments.dialogAssignDescription'),
                      dialogReassignDescription: t('employees.assignments.dialogReassignDescription'),
                      workplaceLabel: t('employees.assignments.workplaceLabel'),
                      workplacePlaceholder: t('employees.assignments.workplacePlaceholder'),
                      reasonLabel: t('employees.assignments.reasonLabel'),
                      notesLabel: t('employees.assignments.notesLabel'),
                      submitting: t('employees.assignments.submitting'),
                      submit: t('common.save'),
                      cancel: t('common.cancel'),
                      endConfirm: t('employees.assignments.endConfirm'),
                      reasonHired: t('employees.assignments.reason.hired'),
                      reasonPromoted: t('employees.assignments.reason.promoted'),
                      reasonTransferred: t('employees.assignments.reason.transferred'),
                      reasonRoleChange: t('employees.assignments.reason.role_change'),
                      reasonDepartmentChange: t('employees.assignments.reason.department_change'),
                      reasonOther: t('employees.assignments.reason.other'),
                      errorMessage: t('employees.form.errorMessage'),
                      noWorkplaces: t('employees.assignments.noWorkplacesAvailable'),
                    }}
                  />
                )}
              </div>

              {currentAssignment ? (
                <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                  <div className="text-sm text-muted-foreground">{t('employees.assignments.current')}</div>
                  <div className="font-medium mt-1">
                    <Link
                      href={`/companies/${currentAssignment.workplace.companyId}/workplaces/${currentAssignment.workplace.id}`}
                      className="hover:underline"
                    >
                      {formatWorkplaceLabel(currentAssignment.workplace)}
                    </Link>
                    {currentAssignment.workplace.department && (
                      <span className="text-muted-foreground font-normal"> — {currentAssignment.workplace.department}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {currentAssignment.workplace.company.name} · {t('employees.assignments.since')}{' '}
                    {formatDate(currentAssignment.startDate, 'medium', loc)}
                  </div>
                  {currentAssignment.notes && (
                    <div className="text-xs text-muted-foreground mt-2 italic whitespace-pre-wrap">{currentAssignment.notes}</div>
                  )}
                </div>
              ) : (
                <EmptyState size="compact" illustration="workplaces" title={t('employees.assignments.noCurrent')} />
              )}

              {historyAssignments.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{t('employees.assignments.historyTitle')}</h3>
                  <div className="border rounded-lg divide-y">
                    {historyAssignments.map((a) => (
                      <div key={a.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium">
                              <Link href={`/companies/${a.workplace.companyId}/workplaces/${a.workplace.id}`} className="hover:underline">
                                {formatWorkplaceLabel(a.workplace)}
                              </Link>
                              {a.workplace.department && <span className="text-muted-foreground font-normal"> — {a.workplace.department}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{a.workplace.company.name}</div>
                          </div>
                          <div className="text-xs text-muted-foreground text-right">
                            <div>
                              {formatDate(a.startDate, 'medium', loc)} → {a.endDate ? formatDate(a.endDate, 'medium', loc) : '—'}
                            </div>
                            {a.reasonForChange && <div className="mt-0.5">{t(`employees.assignments.reason.${a.reasonForChange}`)}</div>}
                          </div>
                        </div>
                        {a.notes && <div className="text-xs text-muted-foreground mt-2 italic whitespace-pre-wrap">{a.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === 'vaccinations' && (
            <VaccinationsTab employeeId={employee.id} canWrite={caps.canWriteClinical} locale={loc} />
          )}

          {activeTab === 'medical-events' && (
            <MedicalEventsTab employeeId={employee.id} canWrite={caps.canWriteClinical} locale={loc} />
          )}

          {activeTab === 'documents' && (
            <DocumentsSection entityType="employee" entityId={employee.id} tenantId={user.tenantId} canWrite={caps.canWriteAdministrative} locale={locale} />
          )}

          {/* ── Date personale: identity / contact / emergency / medical / medic curant / retenție ── */}
          {activeTab === 'personal' && (
            <div className="space-y-6">
              <div className="bg-[#F8FAFB] dark:bg-muted/30 border border-[#E2E8F0] dark:border-border rounded-xl px-5 py-3 flex items-center gap-3">
                <Building2 size={18} className="text-primary shrink-0" />
                {employee.company ? (
                  <span className="text-sm font-medium text-[#0F1F3A] dark:text-foreground">{employee.company.name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">
                    Neatribuit —{' '}
                    <Link href={`/employees/${employee.id}/edit`} className="text-primary not-italic no-underline hover:underline">
                      editați angajatul →
                    </Link>
                  </span>
                )}
              </div>

              {sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  <div className="border rounded-lg divide-y">
                    {section.rows.map(([label, value]) => {
                      const isCnpRow = employee.idDocumentType === 'cnp' && label === t('employees.form.fieldCnp')
                      const isPlainIdNumberRow =
                        employee.idDocumentType !== 'cnp' && label === t('employees.form.fieldIdDocumentNumber')
                      const displayValue: React.ReactNode = isCnpRow ? (
                        <CnpReveal
                          masked={cnpMaskedDisplay ?? '•••'}
                          plaintext={cnpPlaintext}
                          decryptError={cnpDecryptError}
                          revealLabel={t('employees.cnp.revealButton')}
                          hideLabel={t('employees.cnp.hideButton')}
                          noPermissionLabel={t('employees.cnp.noPermission')}
                          decryptErrorLabel={t('employees.cnp.decryptError')}
                        />
                      ) : isPlainIdNumberRow ? (
                        employee.idDocumentNumber || '—'
                      ) : value && value !== '' ? (
                        value
                      ) : (
                        '—'
                      )
                      return (
                        <div key={label} className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
                          <div className="text-sm font-medium text-muted-foreground">{label}</div>
                          <div className="md:col-span-2 text-sm whitespace-pre-wrap">{displayValue}</div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}

              {(employee.medicCurantName || employee.medicCurantPhone) && (
                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Medic curant</h2>
                  <div className="border rounded-lg px-4 py-3">
                    {employee.medicCurantName && <div className="text-sm">{employee.medicCurantName}</div>}
                    {employee.medicCurantPhone && (
                      <a href={`tel:${employee.medicCurantPhone}`} className="text-sm text-primary hover:underline">
                        {employee.medicCurantPhone}
                      </a>
                    )}
                  </div>
                </section>
              )}

              {caps.canWriteAdministrative && (
                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Retenție date</h2>
                  <div className="border rounded-lg px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Perioadă de retenție</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {employee.dataRetentionYears
                            ? `${employee.dataRetentionYears} ani (suprascris individual)`
                            : `${tenantRetentionYears} ani (implicit cabinet)`}
                        </p>
                      </div>
                      <RetentionOverrideButton
                        employeeId={employee.id}
                        currentYears={employee.dataRetentionYears ?? null}
                        tenantDefault={tenantRetentionYears}
                      />
                    </div>
                    {employee.dataRetentionYears && (
                      <p className="mt-2 text-xs text-amber-700">
                        ⚠ Perioadă extinsă activă — date se păstrează {employee.dataRetentionYears} ani conform obligației legale pentru expunere la noxe speciale.
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <EmployeeProfileSummary employeeId={employee.id} />
        </aside>
      </div>
    </div>
  )
}

function StripTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  )
}

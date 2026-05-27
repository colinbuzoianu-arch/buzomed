import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { Building2 } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { EmployeeActions } from './employee-actions'
import { EmployeeAssignmentManager } from './assignment-manager'
import { DocumentsSection } from '@/app/(authenticated)/_components/documents-section'
import { decryptCnp } from '@/lib/crypto/cnp-cipher'
import { maskCnp } from '@/lib/crypto/cnp-validation'
import { CnpReveal } from './cnp-reveal'
import { formatDate } from '@/lib/format-date'
import { EmployeeProfileSummary } from '@/components/ai/EmployeeProfileSummary'
import { VaccinationsTab } from '@/components/employees/vaccinations-tab'
import { MedicalEventsTab } from '@/components/employees/medical-events-tab'

const VALID_TABS = ['examinations', 'vaccinations', 'medical-events', 'documents'] as const
type EmployeeTab = typeof VALID_TABS[number]

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function EmployeeDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params
  const sp = await searchParams
  const activeTab: EmployeeTab = VALID_TABS.includes(sp.tab as EmployeeTab)
    ? (sp.tab as EmployeeTab)
    : 'examinations'

  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  })

  if (!employee) notFound()

  const [assignmentRows, workplaceOptions, recentExaminations] =
    await Promise.all([
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
              company: { select: { id: true, name: true } },
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
        },
      }),
      prisma.examination.findMany({
        where: { employeeId: id, tenantId: user.tenantId, deletedAt: null },
        orderBy: [
          { signedAt: 'desc' },
          { completedAt: 'desc' },
          { scheduledAt: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 10,
        include: {
          examinationType: {
            select: { nameRo: true, nameEn: true },
          },
        },
      }),
    ])

  const isArchived = employee.archivedAt !== null
  const currentAssignment = assignmentRows.find((a) => a.isCurrent) ?? null
  const historyAssignments = assignmentRows.filter((a) => !a.isCurrent)

  // CNP display. If the employee's ID is a CNP and the actor can view
  // sensitive PII, decrypt it so the reveal toggle has something to show.
  // Otherwise we only ever surface the masked placeholder.
  let cnpPlaintext: string | null = null
  let cnpMaskedDisplay: string | null = null
  if (employee.idDocumentType === 'cnp' && employee.cnpEncrypted) {
    if (caps.canViewSensitivePii) {
      try {
        cnpPlaintext = decryptCnp(employee.cnpEncrypted)
        cnpMaskedDisplay = maskCnp(cnpPlaintext)
      } catch (err) {
        console.error('[employees.detail] CNP decrypt failed', err)
        cnpMaskedDisplay = '*************'
      }
    } else {
      cnpMaskedDisplay = '*************'
    }
  }

  // Translate idDocumentType for display (it's stored as an enum value
  // like 'cnp' / 'passport' / 'eu_id_card' / 'other').
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
        [
          t('employees.form.fieldIdDocumentType'),
          idDocumentTypeLabel[employee.idDocumentType] ?? employee.idDocumentType,
        ],
        // ID document row is special: for CNP-typed employees, render
        // the reveal toggle. For all others, render the plaintext number.
        [
          employee.idDocumentType === 'cnp'
            ? t('employees.form.fieldCnp')
            : t('employees.form.fieldIdDocumentNumber'),
          null, // value rendered separately below
        ],
        [t('employees.form.fieldCompanyEmployeeId'), employee.companyEmployeeId],
        [
          t('employees.form.fieldBirthDate'),
          employee.birthDate ? formatDate(employee.birthDate, 'medium', locale === 'ro' ? 'ro' : 'en') : null,
        ],
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
        [
          t('employees.form.fieldEmergencyRelationship'),
          employee.emergencyContactRelationship,
        ],
      ],
    },
    {
      title: t('employees.form.sectionMedical'),
      rows: [
        [t('employees.form.fieldBloodType'), employee.bloodType],
        [t('employees.form.fieldNotes'), employee.notes],
      ],
    },
  ] as const

  // Latest signed examination, used in header line.
  const lastSigned = recentExaminations.find((e) => e.signedAt !== null) ?? null

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.employees'), href: '/employees' }, { label: `${employee.lastName} ${employee.firstName}` }]} />
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {employee.lastName} {employee.firstName}
            </h1>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 text-sm ${
                  isArchived
                    ? 'text-amber-700'
                    : employee.isActive
                      ? 'text-green-700'
                      : 'text-muted-foreground'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isArchived
                      ? 'bg-amber-500'
                      : employee.isActive
                        ? 'bg-green-600'
                        : 'bg-muted-foreground'
                  }`}
                />
                {isArchived
                  ? t('employees.archived')
                  : employee.isActive
                    ? t('common.active')
                    : t('common.inactive')}
              </span>
              {isArchived && employee.archivedReason && (
                <span className="text-xs text-muted-foreground">
                  ({t(`employees.archivedReason.${employee.archivedReason}`)})
                </span>
              )}
              {isArchived && employee.archivedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(employee.archivedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
              {currentAssignment && (
                <span className="text-xs text-muted-foreground">
                  • {t('employees.assignments.currentlyAt')}{' '}
                  <Link
                    href={`/companies/${currentAssignment.workplace.companyId}/workplaces/${currentAssignment.workplace.id}`}
                    className="underline hover:no-underline"
                  >
                    {currentAssignment.workplace.name}
                  </Link>{' '}
                  ({currentAssignment.workplace.company.name})
                </span>
              )}
              {lastSigned && lastSigned.signedAt && (
                <span className="text-xs text-muted-foreground">
                  • {t('employees.lastExamination')}:{' '}
                  <Link
                    href={`/examinations/${lastSigned.id}`}
                    className="underline hover:no-underline"
                  >
                    {formatDate(lastSigned.signedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                  </Link>
                  {lastSigned.verdict && (
                    <>
                      {' • '}
                      {t(`examinations.form.verdict.${lastSigned.verdict}`)}
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
          {caps.canWriteAdministrative && (
            <div className="flex items-center gap-2 flex-wrap">
              {!isArchived && currentAssignment && (
                <Button asChild>
                  <Link
                    href={`/examinations/new?employeeId=${employee.id}`}
                  >
                    + {t('employees.newExaminationButton')}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/employees/${employee.id}/edit`}>
                  {t('common.edit')}
                </Link>
              </Button>
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
                    left_employment: t(
                      'employees.archivedReason.left_employment'
                    ),
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

      {/* Two-column layout on lg+: main content + AI sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
      <div className="space-y-6 min-w-0">

      {/* Company banner */}
      <div className="bg-[#F8FAFB] border border-[#E2E8F0] rounded-xl px-5 py-3 flex items-center gap-3">
        <Building2 size={18} className="text-primary shrink-0" />
        {employee.company ? (
          <span className="text-sm font-medium text-[#0F1F3A]">
            {employee.company.name}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">
            Neatribuit —{' '}
            <Link
              href={`/employees/${employee.id}/edit`}
              className="text-primary not-italic no-underline hover:underline"
            >
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
              // Special-case: the CNP row renders the reveal toggle
              // instead of plain text. We detect it by label equality
              // against the localized "CNP" label.
              const isCnpRow =
                employee.idDocumentType === 'cnp' &&
                label === t('employees.form.fieldCnp')

              // Special-case: for non-CNP types, render the plaintext
              // idDocumentNumber on the row whose label matches.
              const isPlainIdNumberRow =
                employee.idDocumentType !== 'cnp' &&
                label === t('employees.form.fieldIdDocumentNumber')

              const displayValue: React.ReactNode =
                isCnpRow ? (
                  <CnpReveal
                    masked={cnpMaskedDisplay ?? '*************'}
                    plaintext={cnpPlaintext}
                    revealLabel={t('employees.cnp.revealButton')}
                    hideLabel={t('employees.cnp.hideButton')}
                    noPermissionLabel={t('employees.cnp.noPermission')}
                  />
                ) : isPlainIdNumberRow ? (
                  employee.idDocumentNumber || '—'
                ) : value && value !== '' ? (
                  value
                ) : (
                  '—'
                )

              return (
                <div
                  key={label}
                  className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3"
                >
                  <div className="text-sm font-medium text-muted-foreground">
                    {label}
                  </div>
                  <div className="md:col-span-2 text-sm whitespace-pre-wrap">
                    {displayValue}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {/* Workplace assignments — from session 5 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('employees.assignments.sectionTitle')}
          </h2>
          {caps.canWriteAdministrative && !isArchived && (
            <EmployeeAssignmentManager
              employeeId={employee.id}
              currentAssignmentId={currentAssignment?.id ?? null}
              workplaces={workplaceOptions.map((w) => ({
                id: w.id,
                name: w.name,
                department: w.department,
                companyName: w.company.name,
              }))}
              labels={{
                assignButton: t('employees.assignments.assignButton'),
                reassignButton: t('employees.assignments.reassignButton'),
                endButton: t('employees.assignments.endButton'),
                ending: t('employees.assignments.ending'),
                dialogAssignTitle: t('employees.assignments.dialogAssignTitle'),
                dialogReassignTitle: t(
                  'employees.assignments.dialogReassignTitle'
                ),
                dialogAssignDescription: t(
                  'employees.assignments.dialogAssignDescription'
                ),
                dialogReassignDescription: t(
                  'employees.assignments.dialogReassignDescription'
                ),
                workplaceLabel: t('employees.assignments.workplaceLabel'),
                workplacePlaceholder: t(
                  'employees.assignments.workplacePlaceholder'
                ),
                reasonLabel: t('employees.assignments.reasonLabel'),
                notesLabel: t('employees.assignments.notesLabel'),
                submitting: t('employees.assignments.submitting'),
                submit: t('common.save'),
                cancel: t('common.cancel'),
                endConfirm: t('employees.assignments.endConfirm'),
                reasonHired: t('employees.assignments.reason.hired'),
                reasonPromoted: t('employees.assignments.reason.promoted'),
                reasonTransferred: t(
                  'employees.assignments.reason.transferred'
                ),
                reasonRoleChange: t('employees.assignments.reason.role_change'),
                reasonDepartmentChange: t(
                  'employees.assignments.reason.department_change'
                ),
                reasonOther: t('employees.assignments.reason.other'),
                errorMessage: t('employees.form.errorMessage'),
                noWorkplaces: t('employees.assignments.noWorkplacesAvailable'),
              }}
            />
          )}
        </div>

        {currentAssignment ? (
          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {t('employees.assignments.current')}
                </div>
                <div className="font-medium mt-1">
                  <Link
                    href={`/companies/${currentAssignment.workplace.companyId}/workplaces/${currentAssignment.workplace.id}`}
                    className="hover:underline"
                  >
                    {currentAssignment.workplace.name}
                  </Link>
                  {currentAssignment.workplace.department && (
                    <span className="text-muted-foreground font-normal">
                      {' '}— {currentAssignment.workplace.department}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {currentAssignment.workplace.company.name} •{' '}
                  {t('employees.assignments.since')}{' '}
                  {formatDate(currentAssignment.startDate, 'medium', locale === 'ro' ? 'ro' : 'en')}
                </div>
                {currentAssignment.notes && (
                  <div className="text-xs text-muted-foreground mt-2 italic whitespace-pre-wrap">
                    {currentAssignment.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            size="compact"
            illustration="workplaces"
            title={t('employees.assignments.noCurrent')}
          />
        )}

        {historyAssignments.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('employees.assignments.historyTitle')}
            </h3>
            <div className="border rounded-lg divide-y">
              {historyAssignments.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">
                        <Link
                          href={`/companies/${a.workplace.companyId}/workplaces/${a.workplace.id}`}
                          className="hover:underline"
                        >
                          {a.workplace.name}
                        </Link>
                        {a.workplace.department && (
                          <span className="text-muted-foreground font-normal">
                            {' '}— {a.workplace.department}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {a.workplace.company.name}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      <div>
                        {formatDate(a.startDate, 'medium', locale === 'ro' ? 'ro' : 'en')}
                        {' → '}
                        {a.endDate ? formatDate(a.endDate, 'medium', locale === 'ro' ? 'ro' : 'en') : '—'}
                      </div>
                      {a.reasonForChange && (
                        <div className="mt-0.5">
                          {t(
                            `employees.assignments.reason.${a.reasonForChange}`
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {a.notes && (
                    <div className="text-xs text-muted-foreground mt-2 italic whitespace-pre-wrap">
                      {a.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Profile tabs */}
      <div>
        <div className="flex gap-1 border-b mb-4 overflow-x-auto">
          {(
            [
              ['examinations', t('employees.profileTabs.examinations')],
              ['vaccinations', t('employees.profileTabs.vaccinations')],
              ['medical-events', t('employees.profileTabs.medicalEvents')],
              ['documents', t('employees.profileTabs.documents')],
            ] as [EmployeeTab, string][]
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/employees/${employee.id}?tab=${key}`}
              className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {activeTab === 'examinations' && (
          <section className="space-y-3">
            {recentExaminations.length === 0 ? (
              <EmptyState
                size="compact"
                illustration="examinations"
                title={t('employees.noExaminations')}
              />
            ) : (
              <div className="border rounded-lg divide-y">
                {recentExaminations.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <Link
                      href={`/examinations/${e.id}`}
                      className="flex flex-1 items-center justify-between gap-4 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {e.examinationNumber}
                          </span>
                          <span className="truncate">
                            {locale === 'en'
                              ? e.examinationType.nameEn ?? e.examinationType.nameRo
                              : e.examinationType.nameRo}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {e.signedAt
                            ? `${t('examinations.signedOn')}: ${formatDate(e.signedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}`
                            : e.scheduledAt
                              ? `${t('examinations.scheduledFor')}: ${formatDate(e.scheduledAt, 'medium', locale === 'ro' ? 'ro' : 'en')}`
                              : formatDate(e.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                        </div>
                      </div>
                      <div className="text-xs text-right space-y-1 shrink-0">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded text-xs border">
                            {t(`examinations.status.${e.status}`)}
                          </span>
                        </div>
                        {e.verdict && (
                          <div className="text-muted-foreground">
                            {t(`examinations.form.verdict.${e.verdict}`)}
                          </div>
                        )}
                      </div>
                    </Link>
                    {e.signedAt && (
                      <a
                        href={`/api/examinations/${e.id}/fisa-pdf`}
                        download
                        title={t('employees.downloadFisaTitle')}
                        className="shrink-0 text-muted-foreground hover:text-foreground p-1 rounded"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                          />
                        </svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'vaccinations' && (
          <VaccinationsTab
            employeeId={employee.id}
            canWrite={caps.canWriteClinical}
            locale={locale as 'ro' | 'en'}
          />
        )}

        {activeTab === 'medical-events' && (
          <MedicalEventsTab
            employeeId={employee.id}
            canWrite={caps.canWriteClinical}
            locale={locale as 'ro' | 'en'}
          />
        )}

        {activeTab === 'documents' && (
          <DocumentsSection
            entityType="employee"
            entityId={employee.id}
            tenantId={user.tenantId}
            canWrite={caps.canWriteAdministrative}
            locale={locale}
          />
        )}
      </div>

      </div>{/* end main column */}

      {/* Sidebar */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <EmployeeProfileSummary employeeId={employee.id} />
      </aside>

      </div>{/* end grid */}
    </div>
  )
}

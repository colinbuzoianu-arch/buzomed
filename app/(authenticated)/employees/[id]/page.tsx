import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { EmployeeActions } from './employee-actions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
  })

  if (!employee) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const isArchived = employee.archivedAt !== null

  const sections = [
    {
      title: t('employees.form.sectionIdentity'),
      rows: [
        [t('employees.form.fieldLastName'), employee.lastName],
        [t('employees.form.fieldFirstName'), employee.firstName],
        [
          t('employees.form.fieldIdDocumentType'),
          employee.idDocumentType,
        ],
        [
          t('employees.form.fieldIdDocumentNumber'),
          employee.idDocumentNumber,
        ],
        [
          t('employees.form.fieldCompanyEmployeeId'),
          employee.companyEmployeeId,
        ],
        [
          t('employees.form.fieldBirthDate'),
          employee.birthDate ? dateFormatter.format(employee.birthDate) : null,
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
        [
          t('employees.form.fieldEmergencyName'),
          employee.emergencyContactName,
        ],
        [
          t('employees.form.fieldEmergencyPhone'),
          employee.emergencyContactPhone,
        ],
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/employees"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('employees.backToList')}
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {employee.lastName} {employee.firstName}
            </h1>
            <div className="mt-2 flex items-center gap-3">
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
                  {dateFormatter.format(employee.archivedAt)}
                </span>
              )}
            </div>
          </div>
          {caps.canWrite && (
            <div className="flex items-center gap-2">
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

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="border rounded-lg divide-y">
            {section.rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3"
              >
                <div className="text-sm font-medium text-muted-foreground">
                  {label}
                </div>
                <div className="md:col-span-2 text-sm whitespace-pre-wrap">
                  {value && value !== '' ? value : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

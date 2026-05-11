import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { EmployeeForm, type EmployeeFormValues } from '../../employee-form'
import { buildEmployeeFormLabels } from '../../form-labels'

interface PageProps {
  params: Promise<{ id: string }>
}

function toDateInput(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export default async function EditEmployeePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWrite) redirect('/employees')

  const { id } = await params
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
  })
  if (!employee) notFound()

  // CNP-typed records pre-existed this UI; we still allow viewing them
  // (the schema enforces no idDocumentType change here), but the form
  // dropdown only offers passport / eu_id_card / other. If we hit a CNP
  // record in edit, show 'other' in the dropdown — saving will not write
  // back the type unless the user changes it (PATCH parser skips
  // undefined). The CNP value remains in cnpEncrypted untouched.
  const formIdDocType: 'passport' | 'eu_id_card' | 'other' =
    employee.idDocumentType === 'passport' ||
    employee.idDocumentType === 'eu_id_card' ||
    employee.idDocumentType === 'other'
      ? employee.idDocumentType
      : 'other'

  const initialValues: EmployeeFormValues = {
    firstName: employee.firstName,
    lastName: employee.lastName,
    idDocumentType: formIdDocType,
    idDocumentNumber: employee.idDocumentNumber ?? '',
    companyEmployeeId: employee.companyEmployeeId ?? '',
    birthDate: toDateInput(employee.birthDate),
    gender:
      employee.gender === 'M' ||
      employee.gender === 'F' ||
      employee.gender === 'other'
        ? employee.gender
        : '',
    nationality: employee.nationality ?? 'RO',
    addressLine1: employee.addressLine1 ?? '',
    addressLine2: employee.addressLine2 ?? '',
    city: employee.city ?? '',
    county: employee.county ?? '',
    postalCode: employee.postalCode ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    emergencyContactRelationship: employee.emergencyContactRelationship ?? '',
    bloodType: employee.bloodType ?? '',
    notes: employee.notes ?? '',
    isActive: employee.isActive,
  }

  const labels = buildEmployeeFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/employees/${employee.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {employee.lastName} {employee.firstName}
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {t('employees.editPage.title')}
        </h1>
      </div>

      <EmployeeForm
        employeeId={employee.id}
        initialValues={initialValues}
        labels={labels}
      />
    </div>
  )
}

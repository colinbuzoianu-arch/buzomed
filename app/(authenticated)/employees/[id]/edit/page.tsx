import { redirect, notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import {
  canViewSensitivePii,
  tenantDataCapabilities,
} from '@/lib/permissions/tenant-data'
import { decryptCnp } from '@/lib/crypto/cnp-cipher'
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
  if (!caps.canWriteAdministrative) redirect('/employees')

  const { id } = await params

  const [employee, companies] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    }),
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  if (!employee) notFound()

  // CNP visibility for the edit form.
  //
  // - The dropdown now offers cnp + passport + eu_id_card + other.
  // - For CNP-typed records, we decrypt the CNP and pre-fill the input,
  //   BUT only if the actor can view sensitive PII. An assistant with
  //   write access (theoretical: assistants have read-only today) would
  //   see an empty field; saving without changing the value would not
  //   wipe the encrypted CNP because the PATCH handler treats absent
  //   idDocumentNumber as "leave alone".
  let prefilledIdDocumentNumber = employee.idDocumentNumber ?? ''
  if (employee.idDocumentType === 'cnp' && employee.cnpEncrypted) {
    if (canViewSensitivePii(user, user.tenantId)) {
      try {
        prefilledIdDocumentNumber = decryptCnp(employee.cnpEncrypted)
      } catch (err) {
        console.error('[employees.edit] CNP decrypt failed', {
          employeeId: id,
          error: (err as Error).message,
        })
        // Leave field empty; user will need to re-enter to update.
        prefilledIdDocumentNumber = ''
      }
    } else {
      // Don't expose even the encrypted blob length via the input value.
      prefilledIdDocumentNumber = ''
    }
  }

  const initialValues: EmployeeFormValues = {
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle ?? '',
    idDocumentType: employee.idDocumentType,
    idDocumentNumber: prefilledIdDocumentNumber,
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
        <Breadcrumbs items={[{ label: t('nav.employees'), href: '/employees' }, { label: `${employee.lastName} ${employee.firstName}`, href: `/employees/${employee.id}` }, { label: t('common.edit') }]} />
        <h1 className="text-3xl font-bold mt-2">
          {t('employees.editPage.title')}
        </h1>
      </div>

      <EmployeeForm
        employeeId={employee.id}
        initialValues={initialValues}
        labels={labels}
        companies={companies}
        currentCompanyId={employee.companyId ?? null}
      />
    </div>
  )
}

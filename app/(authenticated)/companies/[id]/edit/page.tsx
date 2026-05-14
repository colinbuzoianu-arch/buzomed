import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { CompanyForm, type CompanyFormValues } from '../../company-form'
import { buildCompanyFormLabels } from '../../form-labels'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Format a Date as YYYY-MM-DD for an <input type="date">.
 * Uses UTC to match how we store @db.Date values (UTC midnight).
 */
function toDateInput(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export default async function EditCompanyPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) {
    redirect('/companies')
  }

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
  })

  if (!company) {
    notFound()
  }

  const initialValues: CompanyFormValues = {
    name: company.name,
    cui: company.cui ?? '',
    registrationNumber: company.registrationNumber ?? '',
    caenCode: company.caenCode ?? '',
    addressLine1: company.addressLine1 ?? '',
    addressLine2: company.addressLine2 ?? '',
    city: company.city ?? '',
    county: company.county ?? '',
    postalCode: company.postalCode ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    contactPersonName: company.contactPersonName ?? '',
    contactPersonRole: company.contactPersonRole ?? '',
    contactPersonPhone: company.contactPersonPhone ?? '',
    contactPersonEmail: company.contactPersonEmail ?? '',
    contractStartDate: toDateInput(company.contractStartDate),
    contractEndDate: toDateInput(company.contractEndDate),
    notes: company.notes ?? '',
    isActive: company.isActive,
  }

  const labels = buildCompanyFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/companies/${company.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {company.name}
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {t('companies.editPage.title')}
        </h1>
      </div>

      <CompanyForm
        companyId={company.id}
        initialValues={initialValues}
        labels={labels}
      />
    </div>
  )
}

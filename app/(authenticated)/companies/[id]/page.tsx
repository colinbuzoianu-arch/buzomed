import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { CompanyDeleteButton } from './company-delete-button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
  })

  if (!company) {
    notFound()
  }

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  // Detail rows. We render every field so an assistant has full visibility
  // even though they can't edit. Empty fields show as "—" for consistency
  // with the list view.
  const sections = [
    {
      title: t('companies.form.sectionInfo'),
      rows: [
        [t('companies.form.fieldName'), company.name],
        [t('companies.form.fieldCui'), company.cui],
        [t('companies.form.fieldRegistration'), company.registrationNumber],
        [t('companies.form.fieldCaenCode'), company.caenCode],
      ],
    },
    {
      title: t('companies.form.sectionAddress'),
      rows: [
        [t('companies.form.fieldAddress1'), company.addressLine1],
        [t('companies.form.fieldAddress2'), company.addressLine2],
        [t('common.city'), company.city],
        [t('common.county'), company.county],
        [t('common.postalCode'), company.postalCode],
        [t('common.phone'), company.phone],
        [t('common.email'), company.email],
        [t('companies.form.fieldWebsite'), company.website],
      ],
    },
    {
      title: t('companies.form.sectionContact'),
      rows: [
        [
          t('companies.form.fieldContactPersonName'),
          company.contactPersonName,
        ],
        [
          t('companies.form.fieldContactPersonRole'),
          company.contactPersonRole,
        ],
        [
          t('companies.form.fieldContactPersonPhone'),
          company.contactPersonPhone,
        ],
        [
          t('companies.form.fieldContactPersonEmail'),
          company.contactPersonEmail,
        ],
      ],
    },
    {
      title: t('companies.form.sectionContract'),
      rows: [
        [
          t('companies.form.fieldContractStart'),
          company.contractStartDate
            ? dateFormatter.format(company.contractStartDate)
            : null,
        ],
        [
          t('companies.form.fieldContractEnd'),
          company.contractEndDate
            ? dateFormatter.format(company.contractEndDate)
            : null,
        ],
        [t('companies.form.fieldNotes'), company.notes],
      ],
    },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/companies"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('companies.backToList')}
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">{company.name}</h1>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 text-sm ${
                company.isActive ? 'text-green-700' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  company.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                }`}
              />
              {company.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </div>
          {caps.canWrite && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/companies/${company.id}/edit`}>
                  {t('common.edit')}
                </Link>
              </Button>
              <CompanyDeleteButton
                companyId={company.id}
                companyName={company.name}
                labels={{
                  delete: t('common.delete'),
                  deleteConfirm: t('companies.deleteConfirm'),
                  deleting: t('companies.deleting'),
                  errorMessage: t('companies.form.errorMessage'),
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

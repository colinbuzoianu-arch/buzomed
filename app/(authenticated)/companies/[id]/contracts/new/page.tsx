import { redirect, notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { ContractForm } from '../contract-form'
import { buildContractFormLabels } from '../form-labels'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewContractPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/companies')

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!company) notFound()

  const labels = buildContractFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: company.name, href: `/companies/${company.id}` }, { label: t('contracts.newPage.title') }]} />
        <h1 className="text-3xl font-bold mt-2">{t('contracts.newPage.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('contracts.newPage.subtitle')}</p>
      </div>

      <ContractForm companyId={company.id} labels={labels} />
    </div>
  )
}

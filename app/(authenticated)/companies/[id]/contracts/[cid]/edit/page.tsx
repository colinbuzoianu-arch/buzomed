import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { ContractForm, type ContractFormValues } from '../../contract-form'
import { buildContractFormLabels } from '../../form-labels'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

interface PageProps {
  params: Promise<{ id: string; cid: string }>
}

function toDateInput(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export default async function EditContractPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/companies')

  const { id: companyId, cid } = await params
  const contract = await prisma.contract.findFirst({
    where: {
      id: cid,
      companyId,
      tenantId: user.tenantId,
      deletedAt: null,
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  })
  if (!contract) notFound()

  const services = Array.isArray(contract.services)
    ? (contract.services as string[]).join('\n')
    : ''

  const initialValues: ContractFormValues = {
    startDate: toDateInput(contract.startDate),
    endDate: toDateInput(contract.endDate),
    services,
    pricePerExamination:
      contract.pricePerExamination != null
        ? Number(contract.pricePerExamination).toString()
        : '',
    priceMonthlyFlat:
      contract.priceMonthlyFlat != null
        ? Number(contract.priceMonthlyFlat).toString()
        : '',
    currency: contract.currency,
    status: contract.status,
    notes: contract.notes ?? '',
  }

  const labels = buildContractFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: contract.company.name, href: `/companies/${contract.company.id}` }, { label: contract.contractNumber, href: `/companies/${companyId}/contracts/${cid}` }, { label: t('common.edit') }]} />
        <h1 className="text-3xl font-bold mt-2">{t('contracts.editPage.title')}</h1>
      </div>

      <ContractForm
        companyId={companyId}
        contractId={cid}
        initialValues={initialValues}
        labels={labels}
      />
    </div>
  )
}

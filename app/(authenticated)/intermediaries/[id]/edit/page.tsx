import { notFound, redirect } from 'next/navigation'
import { buildIntermediaryFormLabels } from '@/components/intermediaries/form-labels'
import {
  IntermediaryForm,
  type IntermediaryFormValues,
} from '@/components/intermediaries/intermediary-form'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditIntermediaryPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) {
    redirect('/intermediaries')
  }

  const { id } = await params
  const intermediary = await prisma.intermediary.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
  })

  if (!intermediary) {
    notFound()
  }

  const initialValues: IntermediaryFormValues = {
    name: intermediary.name,
    cui: intermediary.cui ?? '',
    nrRegCom: intermediary.nrRegCom ?? '',
    address: intermediary.address ?? '',
    city: intermediary.city ?? '',
    county: intermediary.county ?? '',
    iban: intermediary.iban ?? '',
    bank: intermediary.bank ?? '',
    contactPersonName: intermediary.contactPersonName ?? '',
    contactPersonEmail: intermediary.contactPersonEmail ?? '',
    contactPersonPhone: intermediary.contactPersonPhone ?? '',
    notes: intermediary.notes ?? '',
    isActive: intermediary.isActive,
  }

  const labels = buildIntermediaryFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.intermediaries'), href: '/intermediaries' },
            { label: intermediary.name, href: `/intermediaries/${intermediary.id}` },
            { label: t('common.edit') },
          ]}
        />
        <h1 className="text-3xl font-bold mt-2">{t('intermediaries.editPage.title')}</h1>
      </div>

      <IntermediaryForm
        intermediaryId={intermediary.id}
        initialValues={initialValues}
        labels={labels}
      />
    </div>
  )
}

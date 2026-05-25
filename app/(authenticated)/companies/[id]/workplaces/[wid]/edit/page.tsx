import { redirect, notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { WorkplaceForm, type WorkplaceFormValues } from '../../workplace-form'
import { buildWorkplaceFormLabels } from '../../form-labels'
import { parseRiskProfile } from '@/lib/workplaces/risk-profile'

interface PageProps {
  params: Promise<{ id: string; wid: string }>
}

function toDateInput(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export default async function EditWorkplacePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/companies')

  const { id, wid } = await params
  const [workplace, examinationTypes] = await Promise.all([
    prisma.workplace.findFirst({
      where: {
        id: wid,
        companyId: id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        company: { select: { id: true, name: true, caenCode: true } },
      },
    }),
    prisma.examinationType.findMany({
      where: { isActive: true },
      orderBy: { nameRo: 'asc' },
      select: { id: true, nameRo: true, nameEn: true },
    }),
  ])
  if (!workplace) notFound()

  const storedIds = workplace.requiredExaminationTypeIds
  const requiredExaminationTypeIds = Array.isArray(storedIds)
    ? (storedIds as string[])
    : []

  const initialValues: WorkplaceFormValues = {
    name: workplace.name,
    department: workplace.department ?? '',
    description: workplace.description ?? '',
    examinationIntervalMonths: String(workplace.examinationIntervalMonths),
    riskAssessmentSignedByCompany: workplace.riskAssessmentSignedByCompany,
    riskAssessmentSignedAt: toDateInput(workplace.riskAssessmentSignedAt),
    isActive: workplace.isActive,
    riskProfile: parseRiskProfile(workplace.riskProfile),
    requiredExaminationTypeIds,
  }

  const labels = buildWorkplaceFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: workplace.company.name, href: `/companies/${workplace.company.id}` }, { label: workplace.name, href: `/companies/${workplace.company.id}/workplaces/${workplace.id}` }, { label: t('common.edit') }]} />
        <h1 className="text-3xl font-bold mt-2">
          {t('workplaces.editPage.title')}
        </h1>
      </div>

      <WorkplaceForm
        companyId={workplace.company.id}
        workplaceId={workplace.id}
        initialValues={initialValues}
        labels={labels}
        examinationTypes={examinationTypes}
        locale={locale}
        companyCaenCode={workplace.company.caenCode}
      />
    </div>
  )
}

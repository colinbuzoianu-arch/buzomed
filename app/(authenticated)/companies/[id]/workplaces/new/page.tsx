import { redirect, notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { WorkplaceForm } from '../workplace-form'
import { buildWorkplaceFormLabels } from '../form-labels'
import { parseRiskProfile } from '@/lib/workplaces/risk-profile'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewWorkplacePage({ params }: PageProps) {
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
  const [company, examinationTypes, workSites, siblingWorkplaces] = await Promise.all([
    prisma.company.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, name: true, caenCode: true },
    }),
    prisma.examinationType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameRo: 'asc' }],
      select: { id: true, nameRo: true, nameEn: true },
    }),
    prisma.workSite.findMany({
      where: { companyId: id, tenantId: user.tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // Existing workplaces whose risk profile can be copied into the new one.
    prisma.workplace.findMany({
      where: { companyId: id, tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, riskProfile: true, workSite: { select: { name: true } } },
    }),
  ])
  if (!company) notFound()

  const labels = buildWorkplaceFormLabels(t)
  const copyableWorkplaces = siblingWorkplaces.map((w) => ({
    id: w.id,
    label: formatWorkplaceLabel(w),
    riskProfile: parseRiskProfile(w.riskProfile),
  }))

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: company.name, href: `/companies/${company.id}` }, { label: t('workplaces.newPage.title') }]} />
        <h1 className="text-3xl font-bold mt-2">
          {t('workplaces.newPage.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('workplaces.newPage.subtitle')}
        </p>
      </div>

      <WorkplaceForm
        companyId={company.id}
        labels={labels}
        examinationTypes={examinationTypes}
        workSites={workSites}
        copyableWorkplaces={copyableWorkplaces}
        locale={locale}
        companyCaenCode={company.caenCode}
      />
    </div>
  )
}

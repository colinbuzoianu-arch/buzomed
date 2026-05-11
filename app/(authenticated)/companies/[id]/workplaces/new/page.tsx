import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { WorkplaceForm } from '../workplace-form'
import { buildWorkplaceFormLabels } from '../form-labels'

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
  if (!caps.canWrite) {
    redirect('/companies')
  }

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!company) notFound()

  const labels = buildWorkplaceFormLabels(t)

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
          {t('workplaces.newPage.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('workplaces.newPage.subtitle')}
        </p>
      </div>

      <WorkplaceForm companyId={company.id} labels={labels} />
    </div>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import CompaniesList from '@/components/companies/companies-list'
import { CompaniesListSkeleton } from '@/components/companies/companies-list-skeleton'

export default async function CompaniesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const tenantId = user.tenantId

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
            {t('companies.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('companies.subtitle')}
          </p>
        </div>
        {caps.canWriteAdministrative && (
          <Button asChild>
            <Link href="/companies/new">+ {t('companies.newButton')}</Link>
          </Button>
        )}
      </div>

      <Suspense fallback={<CompaniesListSkeleton />}>
        <CompaniesList
          tenantId={tenantId}
          locale={locale}
          t={t}
          canWriteAdministrative={caps.canWriteAdministrative}
        />
      </Suspense>
    </div>
  )
}

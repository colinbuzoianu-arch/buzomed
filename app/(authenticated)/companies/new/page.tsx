import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { CompanyForm } from '../company-form'
import { buildCompanyFormLabels } from '../form-labels'

export default async function NewCompanyPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) {
    redirect('/companies')
  }

  const labels = buildCompanyFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/companies"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('companies.backToList')}
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {t('companies.newPage.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('companies.newPage.subtitle')}
        </p>
      </div>

      <CompanyForm labels={labels} />
    </div>
  )
}

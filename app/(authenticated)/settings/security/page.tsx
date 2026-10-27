import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { SecurityClient } from '@/components/account/security-client'
import { buildSecurityLabels } from '@/components/account/security-labels'

export const metadata = { title: 'Securitate cont — Buzomed' }

/**
 * Account security (optional 2FA) for every cabinet role and super_admin.
 * company_hr users reach the equivalent page under /hr-portal/security, since
 * the authenticated layout keeps them in their own portal.
 */
export default async function AccountSecurityPage() {
  // requireUser already bounces a half-logged-in user to the 2FA step.
  await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('account.security.title') }]} />
      <SecurityClient labels={buildSecurityLabels(t)} locale={locale} />
    </div>
  )
}

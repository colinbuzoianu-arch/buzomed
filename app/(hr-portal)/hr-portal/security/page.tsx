import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { SecurityClient } from '@/components/account/security-client'
import { buildSecurityLabels } from '@/components/account/security-labels'

export const metadata = { title: 'Securitate cont — Buzomed' }

/** Account security (optional 2FA) for company_hr users, inside the HR portal. */
export default async function HrSecurityPage() {
  await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  return <SecurityClient labels={buildSecurityLabels(t)} locale={locale} />
}

import { getLocale, getTranslator } from '@/lib/i18n'
import { ReportsNav } from './reports-nav'

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const t = getTranslator(locale)

  const navItems = [
    { href: '/reports', label: t('reports.nav.activity') },
    { href: '/reports/expiration', label: t('reports.nav.expiration') },
    { href: '/reports/hazards', label: t('reports.nav.hazards') },
    { href: '/reports/vaccinations', label: t('reports.nav.vaccinations') },
    { href: '/reports/practitioners', label: t('reports.nav.practitioners') },
    { href: '/reports/regulatory', label: t('reports.nav.regulatory') },
  ]

  return (
    <div className="space-y-6">
      <ReportsNav items={navItems} />
      {children}
    </div>
  )
}

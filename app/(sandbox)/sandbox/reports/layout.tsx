import { ChartThemeStyle } from '@/components/reports/charts/chart-theme'
import { getTranslator } from '@/lib/i18n'
import { SandboxReportsNav } from './_reports-nav'

export default function SandboxReportsLayout({ children }: { children: React.ReactNode }) {
  const t = getTranslator('ro')
  const navItems = [
    { href: '/sandbox/reports', label: t('reports.nav.activity') },
    { href: '/sandbox/reports/compliance', label: t('reports.nav.compliance') },
    { href: '/sandbox/reports/expiration', label: t('reports.nav.expiration') },
    { href: '/sandbox/reports/hazards', label: t('reports.nav.hazards') },
    { href: '/sandbox/reports/vaccinations', label: t('reports.nav.vaccinations') },
    { href: '/sandbox/reports/practitioners', label: t('reports.nav.practitioners') },
  ]
  return (
    <div className="space-y-6">
      {/* Injects the --chart-* CSS variables the reused charts read. */}
      <ChartThemeStyle />
      <SandboxReportsNav items={navItems} />
      {children}
    </div>
  )
}

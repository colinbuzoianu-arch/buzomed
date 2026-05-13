import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LogoutButton } from '@/components/logout-button'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { MobileNav } from '@/components/mobile-nav'
import Link from 'next/link'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  const isSuperAdmin = user.roles.includes('super_admin')
  const hasTenant = user.tenantId !== null
  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )

  // Centralized list of nav items so the mobile drawer and the desktop
  // nav stay in sync. Different visibility rules apply per role.
  const navItems: Array<{ href: string; label: string }> = []
  if (isSuperAdmin) {
    navItems.push({ href: '/super-admin', label: t('nav.tenants') })
  } else if (hasTenant) {
    navItems.push({ href: '/companies', label: t('nav.companies') })
    navItems.push({ href: '/employees', label: t('nav.employees') })
    navItems.push({ href: '/examinations', label: t('nav.examinations') })
    if (hasReportingRole) {
      navItems.push({ href: '/reports', label: t('nav.reports') })
    }
    navItems.push({ href: '/team', label: t('nav.team') })
  }

  const userDisplayName = `${user.firstName} ${user.lastName}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 md:gap-8 min-w-0">
            <BuzomedLogo variant="icon" size="md" />

            {/* Desktop nav — hidden on mobile, drawer used instead */}
            <nav className="hidden md:flex gap-4 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-sm text-muted-foreground hidden lg:inline">
              {userDisplayName}
            </span>
            <LanguageSwitcher currentLocale={locale} />
            <div className="hidden md:block">
              <LogoutButton label={t('common.logout')} />
            </div>

            {/* Mobile drawer trigger */}
            <MobileNav
              items={navItems}
              userName={userDisplayName}
              closeLabel={t('common.close')}
              logoutLabel={t('common.logout')}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        {children}
      </main>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LogoutButton } from '@/components/logout-button'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { TenantLogo } from '@/components/tenant-logo'
import { MobileNav } from '@/components/mobile-nav'
import { AppNav } from '@/components/app-nav'
import { IrisPanel } from '@/components/iris/iris-panel'
import { SubscriptionBanner } from '@/components/subscription-banner'
import Image from 'next/image'
import Link from 'next/link'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  // company_hr users have their own portal — keep them out of the main app
  if (user.roles.includes('company_hr') && !user.roles.some(r => r !== 'company_hr')) {
    redirect('/hr-portal/dashboard')
  }

  const locale = await getLocale()
  const t = getTranslator(locale)

  const isSuperAdmin = user.roles.includes('super_admin')
  const hasTenant = user.tenantId !== null
  const isAdmin = user.roles.includes('practice_admin')
  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )

  // Fetch tenant data for non-super-admin users
  const tenantData = hasTenant
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId! },
        select: { logoUrl: true, name: true, subscriptionStatus: true },
      })
    : null

  const subscription = hasTenant
    ? await prisma.subscription.findFirst({
        where: { tenantId: user.tenantId! },
        orderBy: { createdAt: 'desc' },
        select: { status: true, trialEndsAt: true, tier: true },
      })
    : null

  if (
    tenantData?.subscriptionStatus === 'suspended' &&
    !user.roles.includes('super_admin')
  ) {
    redirect('/suspended')
  }

  const tenantLogoUrl = tenantData?.logoUrl ?? null
  const cabinetName = tenantData?.name ?? 'Cabinet'

  // Centralized list of nav items so the mobile drawer and the desktop
  // nav stay in sync. Different visibility rules apply per role.
  const navItems: Array<{ href: string; label: string }> = []
  if (isSuperAdmin) {
    navItems.push({ href: '/super-admin', label: t('nav.tenants') })
  } else if (hasTenant) {
    navItems.push({ href: '/dashboard', label: t('nav.dashboard') })
    navItems.push({ href: '/companies', label: t('nav.companies') })
    navItems.push({ href: '/employees', label: t('nav.employees') })
    navItems.push({ href: '/examinations', label: t('nav.examinations') })
    if (hasReportingRole) {
      navItems.push({ href: '/medical-events', label: t('nav.medicalEvents') })
      navItems.push({ href: '/reports', label: t('nav.reports') })
    }
    navItems.push({ href: '/team', label: t('nav.team') })
    if (isAdmin) {
      navItems.push({ href: '/settings/practice', label: t('nav.settings') })
      navItems.push({ href: '/settings/audit-log', label: 'Jurnal acces' })
      navItems.push({ href: '/settings/billing', label: 'Abonament' })
    }
  }

  const userDisplayName = `${user.firstName} ${user.lastName}`
  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-gradient-to-b from-background to-background/98 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
            {hasTenant && tenantLogoUrl ? (
              <div className="flex items-center gap-3 shrink-0">
                <TenantLogo logoUrl={tenantLogoUrl} size="md" />
                <span className="w-px h-5 bg-border" />
                <BuzomedLogo variant="icon" size="sm" />
              </div>
            ) : (
              <div className="shrink-0">
                <BuzomedLogo variant="icon" size="md" />
              </div>
            )}

            <AppNav items={navItems} />
          </div>

          <div className="flex items-center gap-2">
            {/* Command palette hint — visual signal only, not wired yet */}
            <span
              className="hidden lg:inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] text-[hsl(var(--text-faint))] font-mono"
              aria-hidden
            >
              <span>⌘</span><span>K</span>
            </span>

            <LanguageSwitcher currentLocale={locale} />

            <span className="w-px h-5 bg-border hidden lg:block" />

            <div className="hidden lg:flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold select-none">
              {initials}
            </div>

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

      {hasTenant && !isSuperAdmin && <SubscriptionBanner subscription={subscription} />}

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      {/* Iris — asistentul intern */}
      {hasTenant && (
        <IrisPanel
          cabinetName={cabinetName}
          locale={locale as 'ro' | 'en'}
          userName={`${user.firstName} ${user.lastName}`}
        />
      )}

      <footer className="border-t bg-[hsl(var(--surface-muted))]/40 py-3 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-faint))]">
              <span>Produs de</span>
              <a
                href="https://verumsell.com"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-50 hover:opacity-80 transition-opacity"
              >
                <Image
                  src="/verumsell-logo.PNG"
                  alt="Verumsell"
                  width={52}
                  height={18}
                  unoptimized
                  style={{ mixBlendMode: 'multiply' }}
                />
              </a>
              <span>· {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-3">
              <a href="/terms" target="_blank" className="text-[11px] text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] transition-colors">
                Termeni
              </a>
              <a href="/privacy" target="_blank" className="text-[11px] text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] transition-colors">
                Confidențialitate
              </a>
              <a href="mailto:hello@buzomed.com" className="text-[11px] text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] transition-colors">
                Suport
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

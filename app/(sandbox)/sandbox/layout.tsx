import type { Metadata } from 'next'
import Image from 'next/image'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { getTranslator } from '@/lib/i18n'
import { SandboxStoreProvider } from '@/lib/sandbox/store'
import { SandboxBanner } from './_components/sandbox-banner'
import { SandboxMobileNav, SandboxNav, type SandboxNavItem } from './_components/sandbox-nav'
import { SandboxTour } from './_components/sandbox-tour'

/**
 * Public, no-backend demo shell. Mirrors the authenticated app's header /
 * nav / footer, but every byte of state lives in the browser (see
 * SandboxStoreProvider). Romanian only.
 */
export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  // Romanian only — no cookie/DB lookup. Reuses the real translator.
  const t = getTranslator('ro')

  const enabled: SandboxNavItem[] = [
    { href: '/sandbox', label: t('nav.dashboard') },
    { href: '/sandbox/companies', label: t('nav.companies') },
    { href: '/sandbox/employees', label: t('nav.employees') },
    { href: '/sandbox/examinations', label: t('nav.examinations') },
    { href: '/sandbox/reports', label: t('nav.reports') },
    { href: '/sandbox/iris', label: 'Iris' },
  ]
  const disabled: SandboxNavItem[] = [
    { href: '#', label: t('nav.administration') },
    { href: '#', label: t('nav.team') },
    { href: '#', label: 'Facturare' },
    { href: '#', label: 'API' },
    { href: '#', label: t('nav.settings') },
  ]

  const userDisplayName = 'Dr. Ana Demo — Cabinet Demo'

  return (
    <SandboxStoreProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 border-b bg-gradient-to-b from-background to-background/98 backdrop-blur-sm">
          <div className="container mx-auto px-4 h-14 flex items-center gap-4">
            <div className="flex items-center shrink-0">
              <BuzomedLogo variant="icon" size="md" />
            </div>

            <div className="flex-1 flex justify-center min-w-0">
              <SandboxNav enabled={enabled} disabled={disabled} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden lg:block text-xs text-muted-foreground truncate max-w-[220px]">
                {userDisplayName}
              </span>
              <div className="hidden lg:flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold select-none">
                AD
              </div>
              <SandboxMobileNav enabled={enabled} disabled={disabled} userName={userDisplayName} />
            </div>
          </div>
        </header>

        <SandboxBanner />

        <main className="flex-1 container mx-auto px-4 py-6 md:py-8">{children}</main>

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
              <span className="text-[11px] text-[hsl(var(--text-faint))]">Demo — date fictive</span>
            </div>
          </div>
        </footer>

        <SandboxTour />
      </div>
    </SandboxStoreProvider>
  )
}

export const metadata: Metadata = {
  title: 'Demo Buzomed',
  robots: { index: false, follow: false },
}

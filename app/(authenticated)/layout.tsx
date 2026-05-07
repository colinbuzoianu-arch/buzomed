import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LogoutButton } from '@/components/logout-button'
import Link from 'next/link'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold text-primary">
              Buzomed
            </Link>
            
            {user.roles.includes('super_admin') && (
              <nav className="flex gap-4 text-sm">
                <Link
                  href="/super-admin"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('nav.tenants')}
                </Link>
              </nav>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.firstName} {user.lastName}
            </span>
            <LanguageSwitcher currentLocale={locale} />
            <LogoutButton label={t('common.logout')} />
          </div>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}

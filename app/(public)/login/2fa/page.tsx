import type { Metadata } from 'next'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LoginTwoFactorForm } from './login-2fa-form'

export default async function LoginTwoFactorPage() {
  const locale = await getLocale()
  const t = getTranslator(locale)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-end p-4">
        <LanguageSwitcher currentLocale={locale} />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="inline-block">
              <BuzomedLogo variant="wordmark" size="lg" as="plain" />
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">{t('login2fa.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('login2fa.subtitle')}</p>
            </div>

            <LoginTwoFactorForm
              labels={{
                codeLabel: t('login2fa.codeLabel'),
                codePlaceholder: t('login2fa.codePlaceholder'),
                deviceLabel: t('login2fa.deviceLabel'),
                submitButton: t('login2fa.submitButton'),
                submitting: t('login2fa.submitting'),
                errorInvalid: t('login2fa.errorInvalid'),
                errorGeneric: t('login2fa.errorGeneric'),
                errorLocked: t('login2fa.errorLocked'),
                logoutLink: t('login2fa.logoutLink'),
                loading: t('account.security.loading'),
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export const metadata: Metadata = {
  title: 'Verificare în doi pași',
  robots: { index: false, follow: false },
}

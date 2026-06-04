import { getLocale, getTranslator } from '@/lib/i18n'
import { LoginForm } from './login-form'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BuzomedLogo } from '@/components/buzomed-logo'

export default async function LoginPage() {
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
              <h2 className="text-2xl font-semibold">{t('login.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('login.subtitle')}
              </p>
            </div>

            <LoginForm
              labels={{
                emailLabel: t('login.emailLabel'),
                emailPlaceholder: t('login.emailPlaceholder'),
                passwordLabel: t('login.passwordLabel'),
                submitButton: t('login.submitButton'),
                submitting: t('login.submitting'),
                errorInvalid: t('login.errorInvalid'),
                errorGeneric: t('login.errorGeneric'),
                acceptedBanner: t('login.acceptedBanner'),
                forgotPasswordLink: t('login.forgotPasswordLink'),
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

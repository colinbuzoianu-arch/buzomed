import Link from 'next/link'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { ForgotPasswordForm } from './forgot-password-form'

export default async function ForgotPasswordPage() {
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
              <h2 className="text-2xl font-semibold">
                {t('forgotPassword.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('forgotPassword.subtitle')}
              </p>
            </div>

            <ForgotPasswordForm
              labels={{
                emailLabel: t('login.emailLabel'),
                emailPlaceholder: t('login.emailPlaceholder'),
                submitButton: t('forgotPassword.submitButton'),
                submitting: t('forgotPassword.submitting'),
                successMessage: t('forgotPassword.successMessage'),
                errorMessage: t('forgotPassword.errorMessage'),
              }}
            />

            <div className="mt-6 text-center text-sm">
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground"
              >
                ← {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BuzomedLogo } from '@/components/buzomed-logo'
import { ResetPasswordForm } from './reset-password-form'

export default async function ResetPasswordPage() {
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
                {t('resetPassword.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('resetPassword.subtitle')}
              </p>
            </div>

            <ResetPasswordForm
              labels={{
                passwordLabel: t('resetPassword.passwordLabel'),
                confirmLabel: t('resetPassword.confirmLabel'),
                submitButton: t('resetPassword.submitButton'),
                submitting: t('resetPassword.submitting'),
                successMessage: t('resetPassword.successMessage'),
                errorMessage: t('resetPassword.errorMessage'),
                errorMismatch: t('resetPassword.errorMismatch'),
                errorTooShort: t('resetPassword.errorTooShort'),
                errorTokenInvalid: t('resetPassword.errorTokenInvalid'),
                goToApp: t('resetPassword.goToApp'),
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

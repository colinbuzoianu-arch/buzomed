import { getLocale, getTranslator } from '@/lib/i18n'
import { LoginForm } from './login-form'
import { LanguageSwitcher } from '@/components/language-switcher'

export default async function LoginPage() {
  const locale = await getLocale()
  const t = getTranslator(locale)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-end p-4">
        <LanguageSwitcher currentLocale={locale} />
      </header>
      
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-primary">Buzomed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('common.tagline')}</p>
          </div>
          
          <div className="bg-card border rounded-lg p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">{t('login.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('login.subtitle')}</p>
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
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

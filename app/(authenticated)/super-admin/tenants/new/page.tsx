import { requireRole } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { CreateTenantForm } from './create-tenant-form'

interface PageProps {
  searchParams: Promise<{ tier?: string }>
}

export default async function NewTenantPage({ searchParams }: PageProps) {
  await requireRole('super_admin')
  const locale = await getLocale()
  const t = getTranslator(locale)
  const params = await searchParams
  const defaultTier = params.tier === 'enterprise' ? 'enterprise' : undefined

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('createTenant.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('createTenant.subtitle')}</p>
      </div>

      <CreateTenantForm
        defaultTier={defaultTier}
        labels={{
          tenantInfo: t('createTenant.tenantInfo'),
          nameLabel: t('createTenant.nameLabel'),
          namePlaceholder: t('createTenant.namePlaceholder'),
          slugLabel: t('createTenant.slugLabel'),
          slugPlaceholder: t('createTenant.slugPlaceholder'),
          slugHelp: t('createTenant.slugHelp'),
          legalNameLabel: t('createTenant.legalNameLabel'),
          legalNamePlaceholder: t('createTenant.legalNamePlaceholder'),
          cuiLabel: t('createTenant.cuiLabel'),
          registrationLabel: t('createTenant.registrationLabel'),
          addressInfo: t('createTenant.addressInfo'),
          cityLabel: t('common.city'),
          countyLabel: t('common.county'),
          postalCodeLabel: t('common.postalCode'),
          phoneLabel: t('common.phone'),
          emailLabel: t('common.email'),
          adminInfo: t('createTenant.adminInfo'),
          adminEmailLabel: t('createTenant.adminEmailLabel'),
          adminEmailHelp: t('createTenant.adminEmailHelp'),
          adminFirstNameLabel: t('createTenant.adminFirstNameLabel'),
          adminLastNameLabel: t('createTenant.adminLastNameLabel'),
          subscriptionLabel: t('createTenant.subscriptionLabel'),
          subscriptionTrial: t('superAdmin.subscription.trial'),
          subscriptionSolo: t('superAdmin.subscription.solo'),
          subscriptionPractice: t('superAdmin.subscription.practice'),
          subscriptionEnterprise: t('superAdmin.subscription.enterprise'),
          submitButton: t('createTenant.submitButton'),
          submitting: t('createTenant.submitting'),
          successMessage: t('createTenant.successMessage'),
          errorMessage: t('createTenant.errorMessage'),
          cancel: t('common.cancel'),
        }}
      />
    </div>
  )
}

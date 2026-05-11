import type { Translator } from '@/lib/i18n'
import type { CompanyFormLabels } from './company-form'

/**
 * Builds the label bundle for `<CompanyForm />` from a server-side
 * translator. Lives in its own file so the company-form module stays
 * client-only — server-side imports of `@/lib/i18n` here would otherwise
 * pull `cookies()` into the client bundle.
 */
export function buildCompanyFormLabels(t: Translator): CompanyFormLabels {
  return {
    sectionInfo: t('companies.form.sectionInfo'),
    sectionAddress: t('companies.form.sectionAddress'),
    sectionContact: t('companies.form.sectionContact'),
    sectionContract: t('companies.form.sectionContract'),
    sectionStatus: t('companies.form.sectionStatus'),
    fieldName: t('companies.form.fieldName'),
    fieldNamePlaceholder: t('companies.form.fieldNamePlaceholder'),
    fieldCui: t('companies.form.fieldCui'),
    fieldRegistration: t('companies.form.fieldRegistration'),
    fieldCaenCode: t('companies.form.fieldCaenCode'),
    fieldAddress1: t('companies.form.fieldAddress1'),
    fieldAddress2: t('companies.form.fieldAddress2'),
    fieldCity: t('common.city'),
    fieldCounty: t('common.county'),
    fieldPostalCode: t('common.postalCode'),
    fieldPhone: t('common.phone'),
    fieldEmail: t('common.email'),
    fieldWebsite: t('companies.form.fieldWebsite'),
    fieldContactPersonName: t('companies.form.fieldContactPersonName'),
    fieldContactPersonRole: t('companies.form.fieldContactPersonRole'),
    fieldContactPersonPhone: t('companies.form.fieldContactPersonPhone'),
    fieldContactPersonEmail: t('companies.form.fieldContactPersonEmail'),
    fieldContractStart: t('companies.form.fieldContractStart'),
    fieldContractEnd: t('companies.form.fieldContractEnd'),
    fieldNotes: t('companies.form.fieldNotes'),
    fieldIsActive: t('companies.form.fieldIsActive'),
    required: t('companies.form.required'),
    submitCreate: t('companies.form.submitCreate'),
    submitUpdate: t('companies.form.submitUpdate'),
    submitting: t('companies.form.submitting'),
    cancel: t('common.cancel'),
    successCreate: t('companies.form.successCreate'),
    successUpdate: t('companies.form.successUpdate'),
    errorMessage: t('companies.form.errorMessage'),
  }
}

import type { Translator } from '@/lib/i18n'
import type { IntermediaryFormLabels } from './intermediary-form'

/**
 * Builds the label bundle for `<IntermediaryForm />` from a server-side
 * translator. Mirrors app/(authenticated)/companies/form-labels.ts.
 */
export function buildIntermediaryFormLabels(t: Translator): IntermediaryFormLabels {
  return {
    sectionInfo: t('intermediaries.form.sectionInfo'),
    sectionAddress: t('intermediaries.form.sectionAddress'),
    sectionContact: t('intermediaries.form.sectionContact'),
    sectionNotes: t('intermediaries.form.sectionNotes'),
    sectionStatus: t('intermediaries.form.sectionStatus'),
    fieldName: t('intermediaries.form.fieldName'),
    fieldNamePlaceholder: t('intermediaries.form.fieldNamePlaceholder'),
    fieldCui: t('intermediaries.form.fieldCui'),
    fieldNrRegCom: t('intermediaries.form.fieldNrRegCom'),
    fieldAddress: t('intermediaries.form.fieldAddress'),
    fieldCity: t('common.city'),
    fieldCounty: t('common.county'),
    fieldIban: t('intermediaries.form.fieldIban'),
    fieldBank: t('intermediaries.form.fieldBank'),
    fieldContactPersonName: t('intermediaries.form.fieldContactPersonName'),
    fieldContactPersonEmail: t('intermediaries.form.fieldContactPersonEmail'),
    fieldContactPersonPhone: t('intermediaries.form.fieldContactPersonPhone'),
    fieldNotes: t('intermediaries.form.fieldNotes'),
    fieldIsActive: t('intermediaries.form.fieldIsActive'),
    required: t('intermediaries.form.required'),
    submitCreate: t('intermediaries.form.submitCreate'),
    submitUpdate: t('intermediaries.form.submitUpdate'),
    submitting: t('intermediaries.form.submitting'),
    cancel: t('common.cancel'),
    errorMessage: t('intermediaries.form.errorMessage'),
    anafFound: t('intermediaries.form.anafFound'),
    anafInactive: t('intermediaries.form.anafInactive'),
  }
}

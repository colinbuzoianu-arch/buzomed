import type { Translator } from '@/lib/i18n'
import type { ContractFormLabels } from './contract-form'

export function buildContractFormLabels(t: Translator): ContractFormLabels {
  return {
    sectionDates: t('contracts.form.sectionDates'),
    sectionPricing: t('contracts.form.sectionPricing'),
    sectionServices: t('contracts.form.sectionServices'),
    fieldStartDate: t('contracts.form.fieldStartDate'),
    fieldEndDate: t('contracts.form.fieldEndDate'),
    fieldEndDateHelp: t('contracts.form.fieldEndDateHelp'),
    fieldStatus: t('contracts.form.fieldStatus'),
    fieldCurrency: t('contracts.form.fieldCurrency'),
    fieldPricePerExamination: t('contracts.form.fieldPricePerExamination'),
    fieldPriceMonthlyFlat: t('contracts.form.fieldPriceMonthlyFlat'),
    fieldServices: t('contracts.form.fieldServices'),
    fieldServicesHelp: t('contracts.form.fieldServicesHelp'),
    fieldNotes: t('contracts.form.fieldNotes'),
    submitCreate: t('contracts.form.submitCreate'),
    submitUpdate: t('contracts.form.submitUpdate'),
    submitting: t('contracts.form.submitting'),
    cancel: t('common.cancel'),
    errorMessage: t('contracts.form.errorMessage'),
    required: t('contracts.form.required'),
    statusDraft: t('contracts.status.draft'),
    statusActive: t('contracts.status.active'),
    statusExpired: t('contracts.status.expired'),
    statusTerminated: t('contracts.status.terminated'),
  }
}

import type { Translator } from '@/lib/i18n'
import type { SecurityLabels } from './security-client'

/** Builds the SecurityClient label bag from the i18n translator. Shared by the
 * cabinet settings page and the HR-portal security page so they stay in sync. */
export function buildSecurityLabels(t: Translator): SecurityLabels {
  return {
    title: t('account.security.title'),
    intro: t('account.security.intro'),
    statusActive: t('account.security.statusActive'),
    statusInactive: t('account.security.statusInactive'),
    devicesTitle: t('account.security.devicesTitle'),
    addedOn: t('account.security.addedOn'),
    removeButton: t('account.security.removeButton'),
    removeHelp: t('account.security.removeHelp'),
    removeCodeLabel: t('account.security.removeCodeLabel'),
    removeConfirm: t('account.security.removeConfirm'),
    removeCancel: t('account.security.removeCancel'),
    addButton: t('account.security.addButton'),
    activateButton: t('account.security.activateButton'),
    deviceNameLabel: t('account.security.deviceNameLabel'),
    deviceNamePlaceholder: t('account.security.deviceNamePlaceholder'),
    deviceNameDefault: t('account.security.deviceNameDefault'),
    generateButton: t('account.security.generateButton'),
    scanHelp: t('account.security.scanHelp'),
    secretLabel: t('account.security.secretLabel'),
    codeLabel: t('account.security.codeLabel'),
    codePlaceholder: t('account.security.codePlaceholder'),
    confirmButton: t('account.security.confirmButton'),
    cancelButton: t('account.security.cancelButton'),
    maxReached: t('account.security.maxReached'),
    recommendSecond: t('account.security.recommendSecond'),
    appsHelp: t('account.security.appsHelp'),
    lostPhoneHelp: t('account.security.lostPhoneHelp'),
    errorInvalidCode: t('account.security.errorInvalidCode'),
    errorGeneric: t('account.security.errorGeneric'),
    errorNameExists: t('account.security.errorNameExists'),
    successEnabled: t('account.security.successEnabled'),
    successDisabled: t('account.security.successDisabled'),
    busyGenerating: t('account.security.busyGenerating'),
    busyVerifying: t('account.security.busyVerifying'),
    busyRemoving: t('account.security.busyRemoving'),
    loading: t('account.security.loading'),
  }
}

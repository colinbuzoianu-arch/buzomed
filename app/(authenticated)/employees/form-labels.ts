import type { Translator } from '@/lib/i18n'
import type { EmployeeFormLabels } from './employee-form'

export function buildEmployeeFormLabels(t: Translator): EmployeeFormLabels {
  return {
    sectionIdentity: t('employees.form.sectionIdentity'),
    sectionContact: t('employees.form.sectionContact'),
    sectionEmergency: t('employees.form.sectionEmergency'),
    sectionMedical: t('employees.form.sectionMedical'),
    sectionStatus: t('employees.form.sectionStatus'),
    fieldFirstName: t('employees.form.fieldFirstName'),
    fieldLastName: t('employees.form.fieldLastName'),
    fieldIdDocumentType: t('employees.form.fieldIdDocumentType'),
    fieldIdDocumentTypePassport: t(
      'employees.form.fieldIdDocumentTypePassport'
    ),
    fieldIdDocumentTypeEuId: t('employees.form.fieldIdDocumentTypeEuId'),
    fieldIdDocumentTypeOther: t('employees.form.fieldIdDocumentTypeOther'),
    fieldIdDocumentTypeCnpDeferred: t(
      'employees.form.fieldIdDocumentTypeCnpDeferred'
    ),
    fieldIdDocumentNumber: t('employees.form.fieldIdDocumentNumber'),
    fieldCompanyEmployeeId: t('employees.form.fieldCompanyEmployeeId'),
    fieldBirthDate: t('employees.form.fieldBirthDate'),
    fieldGender: t('employees.form.fieldGender'),
    fieldGenderM: t('employees.form.fieldGenderM'),
    fieldGenderF: t('employees.form.fieldGenderF'),
    fieldGenderOther: t('employees.form.fieldGenderOther'),
    fieldGenderUnspecified: t('employees.form.fieldGenderUnspecified'),
    fieldNationality: t('employees.form.fieldNationality'),
    fieldAddress1: t('employees.form.fieldAddress1'),
    fieldAddress2: t('employees.form.fieldAddress2'),
    fieldCity: t('common.city'),
    fieldCounty: t('common.county'),
    fieldPostalCode: t('common.postalCode'),
    fieldPhone: t('common.phone'),
    fieldEmail: t('common.email'),
    fieldEmergencyName: t('employees.form.fieldEmergencyName'),
    fieldEmergencyPhone: t('employees.form.fieldEmergencyPhone'),
    fieldEmergencyRelationship: t(
      'employees.form.fieldEmergencyRelationship'
    ),
    fieldBloodType: t('employees.form.fieldBloodType'),
    fieldNotes: t('employees.form.fieldNotes'),
    fieldIsActive: t('employees.form.fieldIsActive'),
    required: t('employees.form.required'),
    cnpNotice: t('employees.form.cnpNotice'),
    submitCreate: t('employees.form.submitCreate'),
    submitUpdate: t('employees.form.submitUpdate'),
    submitting: t('employees.form.submitting'),
    cancel: t('common.cancel'),
    errorMessage: t('employees.form.errorMessage'),
  }
}

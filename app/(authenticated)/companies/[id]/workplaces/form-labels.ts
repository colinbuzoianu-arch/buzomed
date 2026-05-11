import type { Translator } from '@/lib/i18n'
import type { WorkplaceFormLabels } from './workplace-form'

export function buildWorkplaceFormLabels(t: Translator): WorkplaceFormLabels {
  return {
    sectionInfo: t('workplaces.form.sectionInfo'),
    sectionRiskAssessment: t('workplaces.form.sectionRiskAssessment'),
    sectionStatus: t('workplaces.form.sectionStatus'),
    fieldName: t('workplaces.form.fieldName'),
    fieldNamePlaceholder: t('workplaces.form.fieldNamePlaceholder'),
    fieldDepartment: t('workplaces.form.fieldDepartment'),
    fieldDescription: t('workplaces.form.fieldDescription'),
    fieldExaminationInterval: t('workplaces.form.fieldExaminationInterval'),
    fieldExaminationIntervalHelp: t(
      'workplaces.form.fieldExaminationIntervalHelp'
    ),
    fieldRiskSigned: t('workplaces.form.fieldRiskSigned'),
    fieldRiskSignedAt: t('workplaces.form.fieldRiskSignedAt'),
    fieldIsActive: t('workplaces.form.fieldIsActive'),
    required: t('workplaces.form.required'),
    submitCreate: t('workplaces.form.submitCreate'),
    submitUpdate: t('workplaces.form.submitUpdate'),
    submitting: t('workplaces.form.submitting'),
    cancel: t('common.cancel'),
    errorMessage: t('workplaces.form.errorMessage'),
  }
}

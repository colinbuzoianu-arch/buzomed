import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { MergeForm } from './merge-form'

export default async function MergeEmployeesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/employees')

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/employees"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('employees.import.backToList')}
        </Link>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight mt-2">
          {t('employees.merge.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {t('employees.merge.subtitle')}
        </p>
      </div>

      <MergeForm
        labels={{
          targetLabel: t('employees.merge.targetLabel'),
          sourceLabel: t('employees.merge.sourceLabel'),
          comboboxPlaceholder: t('employees.combobox.placeholder'),
          comboboxSearchPlaceholder: t('employees.combobox.searchPlaceholder'),
          comboboxNoResults: t('employees.combobox.noResults'),
          comboboxTypeMore: t('employees.combobox.typeMore'),
          previewButton: t('employees.merge.previewButton'),
          previewTitle: t('employees.merge.previewTitle'),
          countExaminations: t('employees.merge.countExaminations'),
          countVaccinations: t('employees.merge.countVaccinations'),
          countMedicalEvents: t('employees.merge.countMedicalEvents'),
          countRecalls: t('employees.merge.countRecalls'),
          countAssignments: t('employees.merge.countAssignments'),
          confirmButton: t('employees.merge.confirmButton'),
          confirming: t('employees.merge.confirming'),
          confirmWarning: t('employees.merge.confirmWarning'),
          cancel: t('common.cancel'),
          errorSameEmployee: t('employees.merge.errorSameEmployee'),
          errorMessage: t('employees.merge.errorMessage'),
          successMessage: t('employees.merge.successMessage'),
        }}
      />
    </div>
  )
}

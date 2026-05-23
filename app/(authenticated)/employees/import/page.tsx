import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { ImportClient } from './import-client'

export default async function ImportEmployeesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/employees')

  // Pull companies + their workplaces so the client can validate
  // departments without an extra round-trip.
  const companies = await prisma.company.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      isActive: true,
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      workplaces: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, department: true },
      },
    },
  })

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
          {t('employees.import.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {t('employees.import.subtitle')}
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t('employees.import.noCompanies')}
          </p>
          <Link
            href="/companies/new"
            className="inline-block mt-4 text-sm text-primary hover:underline"
          >
            + {t('employees.import.createCompany')} →
          </Link>
        </div>
      ) : (
        <ImportClient
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            workplaces: c.workplaces.map((w) => ({
              id: w.id,
              name: w.name,
              department: w.department,
            })),
          }))}
          locale={locale}
          labels={{
            stepCompany: t('employees.import.stepCompany'),
            stepFile: t('employees.import.stepFile'),
            stepPreview: t('employees.import.stepPreview'),
            stepConfirm: t('employees.import.stepConfirm'),
            companyLabel: t('employees.import.companyLabel'),
            companyPlaceholder: t('employees.import.companyPlaceholder'),
            companyHelp: t('employees.import.companyHelp'),
            fileLabel: t('employees.import.fileLabel'),
            fileHelp: t('employees.import.fileHelp'),
            fileFormatHelp: t('employees.import.fileFormatHelp'),
            downloadTemplate: t('employees.import.downloadTemplate'),
            previewTitle: t('employees.import.previewTitle'),
            previewSubtitle: t('employees.import.previewSubtitle'),
            rowsTotal: t('employees.import.rowsTotal'),
            rowsValid: t('employees.import.rowsValid'),
            rowsWithIssues: t('employees.import.rowsWithIssues'),
            rowsDuplicate: t('employees.import.rowsDuplicate'),
            colRow: t('employees.import.colRow'),
            colStatus: t('employees.import.colStatus'),
            colFirstName: t('employees.import.colFirstName'),
            colLastName: t('employees.import.colLastName'),
            colEmployeeId: t('employees.import.colEmployeeId'),
            colEmail: t('employees.import.colEmail'),
            colDepartment: t('employees.import.colDepartment'),
            statusOk: t('employees.import.statusOk'),
            statusDuplicate: t('employees.import.statusDuplicate'),
            statusIssue: t('employees.import.statusIssue'),
            statusWarning: t('employees.import.statusWarning'),
            issueMissingFirstName: t('employees.import.issueMissingFirstName'),
            issueMissingLastName: t('employees.import.issueMissingLastName'),
            issueInvalidEmail: t('employees.import.issueInvalidEmail'),
            issueWorkplaceNotFound: t(
              'employees.import.issueWorkplaceNotFound'
            ),
            warningNoDepartment: t('employees.import.warningNoDepartment'),
            warningDuplicateEmployee: t(
              'employees.import.warningDuplicateEmployee'
            ),
            skipDuplicates: t('employees.import.skipDuplicates'),
            importAnywayDuplicates: t(
              'employees.import.importAnywayDuplicates'
            ),
            mappingDetected: t('employees.import.mappingDetected'),
            mappingMissing: t('employees.import.mappingMissing'),
            mappingUnmapped: t('employees.import.mappingUnmapped'),
            mappingAiBadge: t('employees.import.mappingAiBadge'),
            mappingAiNote: t('employees.import.mappingAiNote'),
            mappingAiTimeout: t('employees.import.mappingAiTimeout'),
            mappingAiLoading: t('employees.import.mappingAiLoading'),
            mappingLowConfidence: t('employees.import.mappingLowConfidence'),
            commitButton: t('employees.import.commitButton'),
            committing: t('employees.import.committing'),
            cancelButton: t('common.cancel'),
            resetButton: t('employees.import.resetButton'),
            resultSuccess: t('employees.import.resultSuccess'),
            resultSummary: t('employees.import.resultSummary'),
            backToList: t('employees.import.backToList'),
            errorParse: t('employees.import.errorParse'),
            errorCommit: t('employees.import.errorCommit'),
            errorNoFile: t('employees.import.errorNoFile'),
            errorNoCompany: t('employees.import.errorNoCompany'),
            errorNoValidRows: t('employees.import.errorNoValidRows'),
            diffLoading: t('employees.import.diffLoading'),
            diffTitle: t('employees.import.diffTitle'),
            diffNew: t('employees.import.diffNew'),
            diffLeaving: t('employees.import.diffLeaving'),
            diffMoved: t('employees.import.diffMoved'),
            diffUnchanged: t('employees.import.diffUnchanged'),
            diffLeavingNote: t('employees.import.diffLeavingNote'),
            diffFirstImport: t('employees.import.diffFirstImport'),
            diffFirstImportDesc: t('employees.import.diffFirstImportDesc'),
            diffShowLeaving: t('employees.import.diffShowLeaving'),
            diffShowMoved: t('employees.import.diffShowMoved'),
            workplaceBreakdown: t('employees.import.workplaceBreakdown'),
            workplaceUnassigned: t('employees.import.workplaceUnassigned'),
          }}
        />
      )}
    </div>
  )
}

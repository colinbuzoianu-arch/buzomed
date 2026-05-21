import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { NewExaminationForm } from './new-examination-form'

interface PageProps {
  searchParams: Promise<{ employeeId?: string }>
}

export default async function NewExaminationPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/examinations')

  const params = await searchParams
  const preselectedEmployeeId = params.employeeId

  const [employees, examinationTypes, practitioners, workplaces] = await Promise.all([
    prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        archivedAt: null,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyEmployeeId: true,
        company: { select: { name: true } },
        workplaceAssignments: {
          where: { isCurrent: true },
          take: 1,
          include: {
            workplace: {
              select: {
                id: true,
                name: true,
                department: true,
                isActive: true,
                company: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.examinationType.findMany({
      where: { isActive: true },
      orderBy: { nameRo: 'asc' },
      select: { id: true, code: true, nameRo: true, nameEn: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        deletedAt: null,
        roles: { hasSome: ['practitioner', 'practice_admin'] },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        professionalTitle: true,
        professionalCode: true,
      },
    }),
    prisma.workplace.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, isActive: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        department: true,
        company: { select: { name: true } },
      },
    }),
  ])

  const eligibleEmployees = employees.map((e) => {
    const assignment = e.workplaceAssignments[0]
    const activeAssignment = assignment?.workplace.isActive ? assignment : null
    return {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      companyEmployeeId: e.companyEmployeeId,
      workplaceId: activeAssignment?.workplace.id ?? null,
      workplaceName: activeAssignment?.workplace.name ?? null,
      workplaceDepartment: activeAssignment?.workplace.department ?? null,
      companyName: activeAssignment?.workplace.company.name ?? e.company?.name ?? null,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('examinations.backToList')}
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {t('examinations.newPage.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('examinations.newPage.subtitle')}
        </p>
      </div>

      {eligibleEmployees.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('examinations.newPage.noEligibleEmployees')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('examinations.newPage.noEligibleEmployeesHelp')}
          </p>
        </div>
      ) : examinationTypes.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t('examinations.newPage.noExaminationTypes')}
          </p>
        </div>
      ) : practitioners.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t('examinations.newPage.noPractitioners')}
          </p>
        </div>
      ) : (
        <NewExaminationForm
          employees={eligibleEmployees}
          workplaces={workplaces.map((wp) => ({
            id: wp.id,
            name: wp.name,
            department: wp.department,
            companyName: wp.company.name,
          }))}
          examinationTypes={examinationTypes.map((tp) => ({
            id: tp.id,
            code: tp.code,
            name: locale === 'en' ? tp.nameEn ?? tp.nameRo : tp.nameRo,
          }))}
          practitioners={practitioners.map((p) => ({
            id: p.id,
            label: `${p.lastName} ${p.firstName}${
              p.professionalTitle ? ` (${p.professionalTitle})` : ''
            }`,
          }))}
          defaultPractitionerId={
            user.roles.includes('practitioner') ? user.id : undefined
          }
          preselectedEmployeeId={preselectedEmployeeId}
          labels={{
            sectionWhoWhat: t('examinations.form.sectionWhoWhat'),
            sectionContext: t('examinations.form.sectionContext'),
            fieldEmployee: t('examinations.form.fieldEmployee'),
            fieldEmployeePlaceholder: t(
              'examinations.form.fieldEmployeePlaceholder'
            ),
            fieldExaminationType: t('examinations.form.fieldExaminationType'),
            fieldExaminationTypePlaceholder: t(
              'examinations.form.fieldExaminationTypePlaceholder'
            ),
            fieldPractitioner: t('examinations.form.fieldPractitioner'),
            fieldScheduledAt: t('examinations.form.fieldScheduledAt'),
            fieldScheduledAtHelp: t('examinations.form.fieldScheduledAtHelp'),
            fieldRequestSource: t('examinations.form.fieldRequestSource'),
            fieldRequestSourceOptions: {
              none: t('examinations.requestSource.none'),
              employer_request: t('examinations.requestSource.employer_request'),
              periodic_due: t('examinations.requestSource.periodic_due'),
              employee_request: t('examinations.requestSource.employee_request'),
              legal_obligation: t('examinations.requestSource.legal_obligation'),
              other: t('examinations.requestSource.other'),
            },
            fieldReferringDocument: t(
              'examinations.form.fieldReferringDocument'
            ),
            fieldNotes: t('examinations.form.fieldNotes'),
            currentWorkplace: t('examinations.form.currentWorkplace'),
            fieldWorkplace: t('examinations.form.fieldWorkplace'),
            workplaceNone: t('examinations.form.workplaceNone'),
            workplaceRequired: t('examinations.form.workplaceRequired'),
            typeGroupHg355: t('examinations.typeGroups.hg355'),
            typeGroupSpecial: t('examinations.typeGroups.special'),
            submitCreate: t('examinations.form.submitCreate'),
            submitting: t('examinations.form.submitting'),
            cancel: t('common.cancel'),
            errorMessage: t('examinations.form.errorMessage'),
            required: t('examinations.form.required'),
          }}
        />
      )}
    </div>
  )
}

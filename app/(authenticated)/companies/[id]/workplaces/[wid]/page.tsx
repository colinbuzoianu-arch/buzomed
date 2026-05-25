import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { WorkplaceDeleteButton } from './workplace-delete-button'
import {
  parseRiskProfile,
  RISK_PROFILE_SCHEMA,
  type RiskProfile,
} from '@/lib/workplaces/risk-profile'
import { formatDate } from '@/lib/format-date'

interface PageProps {
  params: Promise<{ id: string; wid: string }>
}

export default async function WorkplaceDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id, wid } = await params

  // Fetch workplace + assignments + recent examinations in parallel.
  const [workplace, recentExaminations] = await Promise.all([
    prisma.workplace.findFirst({
      where: {
        id: wid,
        companyId: id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        company: { select: { id: true, name: true } },
        employeeAssignments: {
          where: { isCurrent: true },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyEmployeeId: true,
                archivedAt: true,
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
      },
    }),
    // Recent examinations at this workplace — new in session 6.
    prisma.examination.findMany({
      where: {
        workplaceId: wid,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      orderBy: [
        { signedAt: 'desc' },
        { completedAt: 'desc' },
        { scheduledAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 10,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        examinationType: {
          select: { nameRo: true, nameEn: true },
        },
      },
    }),
  ])

  if (!workplace) notFound()

  const riskProfile = parseRiskProfile(workplace.riskProfile)
  const activeHazards: Array<{ category: string; hazard: string }> = []
  for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
    for (const hazard of hazards) {
      if ((riskProfile[category as keyof RiskProfile] as Record<string, { present: boolean }>)[hazard]?.present) {
        activeHazards.push({ category, hazard })
      }
    }
  }

  const activeAssignments = workplace.employeeAssignments.filter(
    (a) => a.employee && !a.employee.archivedAt
  )

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: workplace.company.name, href: `/companies/${workplace.company.id}` }, { label: workplace.name }]} />
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">{workplace.name}</h1>
            {workplace.department && (
              <p className="text-muted-foreground mt-1">
                {workplace.department}
              </p>
            )}
            <span
              className={`mt-2 inline-flex items-center gap-1.5 text-sm ${
                workplace.isActive ? 'text-green-700' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  workplace.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                }`}
              />
              {workplace.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </div>
          {caps.canWriteAdministrative && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link
                  href={`/companies/${workplace.company.id}/workplaces/${workplace.id}/edit`}
                >
                  {t('common.edit')}
                </Link>
              </Button>
              <WorkplaceDeleteButton
                companyId={workplace.company.id}
                workplaceId={workplace.id}
                workplaceName={workplace.name}
                hasAssignments={activeAssignments.length > 0}
                labels={{
                  delete: t('common.delete'),
                  deleteConfirm: t('workplaces.deleteConfirm'),
                  deleteConfirmWithAssignments: t(
                    'workplaces.deleteConfirmWithAssignments'
                  ),
                  deleting: t('workplaces.deleting'),
                  errorMessage: t('workplaces.form.errorMessage'),
                }}
              />
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('workplaces.form.sectionInfo')}
        </h2>
        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('workplaces.form.fieldDepartment')}
            </div>
            <div className="md:col-span-2 text-sm">
              {workplace.department ?? '—'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('workplaces.form.fieldExaminationInterval')}
            </div>
            <div className="md:col-span-2 text-sm">
              {t('workplaces.intervalDisplay').replace(
                '{months}',
                String(workplace.examinationIntervalMonths)
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('workplaces.form.fieldDescription')}
            </div>
            <div className="md:col-span-2 text-sm whitespace-pre-wrap">
              {workplace.description ?? '—'}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('workplaces.form.sectionRiskAssessment')}
        </h2>
        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('workplaces.form.fieldRiskSigned')}
            </div>
            <div className="md:col-span-2 text-sm">
              {workplace.riskAssessmentSignedByCompany
                ? t('common.yes')
                : t('common.no')}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('workplaces.form.fieldRiskSignedAt')}
            </div>
            <div className="md:col-span-2 text-sm">
              {workplace.riskAssessmentSignedAt
                ? formatDate(workplace.riskAssessmentSignedAt, 'medium', locale === 'ro' ? 'ro' : 'en')
                : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Hazard profile — new in session 12. */}
      {activeHazards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {t('workplaces.form.sectionHazardProfile')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({activeHazards.length})
            </span>
          </h2>
          <div className="border rounded-lg divide-y">
            {RISK_PROFILE_SCHEMA.map(({ category, hazards }) => {
              const presentHazards = hazards.filter(
                (h) => (riskProfile[category as keyof RiskProfile] as Record<string, { present: boolean }>)[h]?.present
              )
              if (presentHazards.length === 0) return null
              return (
                <div key={category} className="px-4 py-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t(`workplaces.form.hazardCategory.${category}`)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {presentHazards.map((hazard) => {
                      const entry = (riskProfile[category as keyof RiskProfile] as Record<string, { present: boolean; severity?: string }>)[hazard]
                      return (
                        <span
                          key={hazard}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                            entry.severity === 'high'
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : entry.severity === 'medium'
                                ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                                : 'border-border bg-muted/50 text-foreground'
                          }`}
                        >
                          {t(`workplaces.form.hazardName.${hazard}`)}
                          {entry.severity && (
                            <span className="opacity-70">
                              · {t(`workplaces.form.severity${entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1)}`)}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('workplaces.currentlyAssignedTitle')}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({activeAssignments.length})
          </span>
        </h2>
        {activeAssignments.length === 0 ? (
          <EmptyState
            size="compact"
            illustration="employees"
            title={t('workplaces.noEmployeesAssigned')}
          />
        ) : (
          <div className="border rounded-lg divide-y">
            {activeAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/employees/${a.employee.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">
                    {a.employee.lastName} {a.employee.firstName}
                  </div>
                  {a.employee.companyEmployeeId && (
                    <div className="text-xs text-muted-foreground">
                      {a.employee.companyEmployeeId}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('workplaces.assignedSince').replace(
                    '{date}',
                    formatDate(a.startDate, 'medium', locale === 'ro' ? 'ro' : 'en')
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent examinations at this workplace — new in session 6. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('workplaces.recentExaminationsTitle')}
        </h2>
        {recentExaminations.length === 0 ? (
          <EmptyState
            size="compact"
            illustration="examinations"
            title={t('workplaces.noExaminations')}
          />
        ) : (
          <div className="border rounded-lg divide-y">
            {recentExaminations.map((e) => (
              <Link
                key={e.id}
                href={`/examinations/${e.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.examinationNumber}
                    </span>
                    <span>
                      {e.employee.lastName} {e.employee.firstName}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {locale === 'en'
                      ? e.examinationType.nameEn ?? e.examinationType.nameRo
                      : e.examinationType.nameRo}
                    {' • '}
                    {e.signedAt
                      ? `${t('examinations.signedOn')}: ${formatDate(e.signedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}`
                      : e.scheduledAt
                        ? `${t('examinations.scheduledFor')}: ${formatDate(e.scheduledAt, 'medium', locale === 'ro' ? 'ro' : 'en')}`
                        : formatDate(e.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                  </div>
                </div>
                <div className="text-xs text-right space-y-1">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-xs border">
                      {t(`examinations.status.${e.status}`)}
                    </span>
                  </div>
                  {e.verdict && (
                    <div className="text-muted-foreground">
                      {t(`examinations.form.verdict.${e.verdict}`)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

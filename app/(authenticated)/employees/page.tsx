import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmployeeSearchInput } from './employee-search-input'
import { WorkplaceFilter } from '@/components/employees/workplace-filter'
import { formatDate } from '@/lib/format-date'

interface PageProps {
  searchParams: Promise<{ archived?: string; q?: string; wp?: string }>
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const params = await searchParams
  const showArchived = params.archived === '1'
  const q = params.q ?? ''
  const wpFilter = params.wp ?? ''

  const [employees, workplacesForFilter] = await Promise.all([
    prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(showArchived ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(q.length >= 2
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { jobTitle: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(wpFilter
          ? {
              workplaceAssignments: {
                some: {
                  workplaceId: wpFilter,
                  isCurrent: true,
                  endDate: null,
                },
              },
            }
          : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        city: true,
        isActive: true,
        archivedAt: true,
        company: { select: { name: true } },
        workplaceAssignments: {
          where: { isCurrent: true, endDate: null },
          select: { workplace: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    }),
    prisma.workplace.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        company: { select: { name: true } },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('employees.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('employees.subtitle')}
          </p>
        </div>
        {caps.canWriteAdministrative && !showArchived && (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/employees/import">
                {t('employees.importButton')}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/employees/new">+ {t('employees.newButton')}</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
        {/* Tab-uri activi/arhivați */}
        <div className="flex gap-2 text-sm">
          <Link
            href="/employees"
            className={`px-3 py-1 rounded-md border ${
              !showArchived ? 'bg-secondary' : 'hover:bg-muted'
            }`}
          >
            {t('employees.tabs.active')}
          </Link>
          <Link
            href={`/employees?archived=1${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`px-3 py-1 rounded-md border ${
              showArchived ? 'bg-secondary' : 'hover:bg-muted'
            }`}
          >
            {t('employees.tabs.archived')}
          </Link>
        </div>

        {/* Search text */}
        <EmployeeSearchInput
          defaultValue={q}
          placeholder={t('employees.search.placeholder')}
        />

        {/* Filtru workplace — ascuns pe archived tab */}
        {!showArchived && workplacesForFilter.length > 0 && (
          <WorkplaceFilter
            workplaces={workplacesForFilter.map((w) => ({
              id: w.id,
              name: w.name,
              companyName: w.company.name,
            }))}
            currentValue={wpFilter}
            placeholder={t('employees.search.workplacePlaceholder')}
            allLabel={t('employees.search.allWorkplaces')}
          />
        )}

        {/* Badge filtru activ — click șterge ?wp= */}
        {wpFilter && (
          <Link
            href={`/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {workplacesForFilter.find((w) => w.id === wpFilter)?.name ?? t('employees.search.workplacePlaceholder')}
            </span>
            <span aria-hidden className="ml-0.5">×</span>
          </Link>
        )}
      </div>

      {employees.length === 0 ? (
        <EmptyState
          illustration="employees"
          title={showArchived ? t('employees.emptyTitleArchived') : t('employees.emptyTitle')}
          description={showArchived ? t('employees.emptyDescriptionArchived') : t('employees.emptyDescription')}
          primaryAction={caps.canWriteAdministrative && !showArchived ? { label: `+ ${t('employees.newButton')}`, href: '/employees/new' } : undefined}
          secondaryAction={caps.canWriteAdministrative && !showArchived ? { label: t('employees.importButton'), href: '/employees/import', variant: 'outline' } : undefined}
        />
      ) : (
        <>
          {/* Desktop table — hidden on small screens */}
          <div className="hidden md:block border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('employees.columns.company')}</TableHead>
                  <TableHead>{t('employees.columns.jobTitle')}</TableHead>
                  <TableHead>{t('employees.columns.city')}</TableHead>
                  {showArchived ? (
                    <TableHead>{t('employees.table.archivedAt')}</TableHead>
                  ) : (
                    <TableHead>{t('employees.columns.workplace')}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => {
                  const companyName =
                    e.company?.name ?? null
                  return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/employees/${e.id}`}
                        className="hover:underline"
                      >
                        {e.lastName} {e.firstName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {companyName ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {e.jobTitle ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {e.city ?? '—'}
                    </TableCell>
                    {showArchived ? (
                      <TableCell className="text-muted-foreground text-sm">
                        {e.archivedAt
                          ? formatDate(e.archivedAt, 'medium', locale === 'ro' ? 'ro' : 'en')
                          : '—'}
                      </TableCell>
                    ) : (
                      <TableCell className="text-sm">
                        {e.workplaceAssignments[0]?.workplace?.name ? (
                          <span className="text-foreground">
                            {e.workplaceAssignments[0].workplace.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            {t('employees.noWorkplace')}
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards — visible only on small screens */}
          <div className="md:hidden space-y-2">
            {employees.map((e) => {
              const companyName =
                e.company?.name ?? null
              return (
              <Link
                key={e.id}
                href={`/employees/${e.id}`}
                className="block border rounded-lg p-4 hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {e.lastName} {e.firstName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {companyName && (
                        <div className="truncate">{companyName}</div>
                      )}
                      {e.jobTitle && (
                        <div className="truncate">{e.jobTitle}</div>
                      )}
                      {!showArchived && (
                        e.workplaceAssignments[0]?.workplace?.name ? (
                          <div className="truncate">{e.workplaceAssignments[0].workplace.name}</div>
                        ) : (
                          <div className="text-amber-600">{t('employees.noWorkplace')}</div>
                        )
                      )}
                      {e.city && (
                        <div className="truncate">{e.city}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {showArchived ? (
                      <span className="text-xs text-muted-foreground">
                        {e.archivedAt
                          ? formatDate(e.archivedAt, 'medium', locale === 'ro' ? 'ro' : 'en')
                          : '—'}
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          e.isActive
                            ? 'text-green-700'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            e.isActive
                              ? 'bg-green-600'
                              : 'bg-muted-foreground'
                          }`}
                        />
                        {e.isActive
                          ? t('common.active')
                          : t('common.inactive')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

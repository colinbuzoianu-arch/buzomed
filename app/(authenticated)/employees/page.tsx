import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
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
import { SortHeader } from '@/components/employees/sort-header'
import { formatDate } from '@/lib/format-date'

interface PageProps {
  searchParams: Promise<{
    archived?: string
    q?: string
    wp?: string
    sort?: string
  }>
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
  const sortRaw = params.sort ?? 'name_asc'

  type DbSortKey = 'name_asc' | 'name_desc' | 'company_asc' | 'company_desc' | 'jobTitle_asc' | 'jobTitle_desc'
  type ClientSortKey = 'lastExam_asc' | 'lastExam_desc' | 'recall_asc' | 'recall_desc' | 'workplace_asc' | 'workplace_desc'
  type SortKey = DbSortKey | ClientSortKey

  const VALID_SORTS: SortKey[] = [
    'name_asc', 'name_desc',
    'company_asc', 'company_desc',
    'jobTitle_asc', 'jobTitle_desc',
    'lastExam_asc', 'lastExam_desc',
    'recall_asc', 'recall_desc',
    'workplace_asc', 'workplace_desc',
  ]

  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : 'name_asc'

  const dbOrderBy: Record<DbSortKey, Prisma.EmployeeOrderByWithRelationInput[]> = {
    name_asc:      [{ lastName: 'asc' }, { firstName: 'asc' }],
    name_desc:     [{ lastName: 'desc' }, { firstName: 'desc' }],
    company_asc:   [{ company: { name: 'asc' } }, { lastName: 'asc' }],
    company_desc:  [{ company: { name: 'desc' } }, { lastName: 'asc' }],
    jobTitle_asc:  [{ jobTitle: 'asc' }, { lastName: 'asc' }],
    jobTitle_desc: [{ jobTitle: 'desc' }, { lastName: 'asc' }],
  }

  const isClientSort = !Object.keys(dbOrderBy).includes(sort)
  const orderBy = isClientSort ? dbOrderBy.name_asc : dbOrderBy[sort as DbSortKey]

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
      orderBy,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        companyEmployeeId: true,
        isActive: true,
        archivedAt: true,
        company: { select: { name: true } },
        workplaceAssignments: {
          where: { isCurrent: true, endDate: null },
          select: { workplace: { select: { id: true, name: true } } },
          take: 1,
        },
        examinations: {
          where: {
            status: 'completed',
            deletedAt: null,
          },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true, signedAt: true, status: true },
          take: 1,
        },
        recalls: {
          where: {
            status: { in: ['pending', 'scheduled', 'overdue'] },
            deletedAt: null,
          },
          orderBy: { dueDate: 'asc' },
          select: { dueDate: true, status: true },
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

  // Client-side sort for columns that can't be ordered in DB (join-dependent)
  let sortedEmployees = [...employees]

  if (sort === 'lastExam_asc' || sort === 'lastExam_desc') {
    sortedEmployees.sort((a, b) => {
      const aDate = a.examinations[0]?.signedAt ?? a.examinations[0]?.completedAt ?? null
      const bDate = b.examinations[0]?.signedAt ?? b.examinations[0]?.completedAt ?? null
      if (!aDate && !bDate) return 0
      if (!aDate) return sort === 'lastExam_asc' ? 1 : -1
      if (!bDate) return sort === 'lastExam_asc' ? -1 : 1
      const diff = new Date(aDate).getTime() - new Date(bDate).getTime()
      return sort === 'lastExam_asc' ? diff : -diff
    })
  } else if (sort === 'recall_asc' || sort === 'recall_desc') {
    sortedEmployees.sort((a, b) => {
      const aDate = a.recalls[0]?.dueDate ?? null
      const bDate = b.recalls[0]?.dueDate ?? null
      if (!aDate && !bDate) return 0
      if (!aDate) return sort === 'recall_asc' ? 1 : -1
      if (!bDate) return sort === 'recall_asc' ? -1 : 1
      const diff = new Date(aDate).getTime() - new Date(bDate).getTime()
      return sort === 'recall_asc' ? diff : -diff
    })
  } else if (sort === 'workplace_asc' || sort === 'workplace_desc') {
    sortedEmployees.sort((a, b) => {
      const aWp = a.workplaceAssignments[0]?.workplace?.name ?? ''
      const bWp = b.workplaceAssignments[0]?.workplace?.name ?? ''
      const cmp = aWp.localeCompare(bWp, 'ro')
      return sort === 'workplace_asc' ? cmp : -cmp
    })
  } else {
    sortedEmployees = employees
  }

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
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <Table>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">
                    <SortHeader
                      label={t('common.name')}
                      sortAsc="name_asc"
                      sortDesc="name_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label={t('employees.columns.company')}
                      sortAsc="company_asc"
                      sortDesc="company_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label={t('employees.columns.jobTitle')}
                      sortAsc="jobTitle_asc"
                      sortDesc="jobTitle_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label={t('employees.columns.lastExam')}
                      sortAsc="lastExam_asc"
                      sortDesc="lastExam_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label={t('employees.columns.nextRecall')}
                      sortAsc="recall_asc"
                      sortDesc="recall_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                  <TableHead className="pr-4">
                    <SortHeader
                      label={t('employees.columns.workplace')}
                      sortAsc="workplace_asc"
                      sortDesc="workplace_desc"
                      currentSort={sort}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEmployees.map((e) => {
                  const lastExam = e.examinations[0]
                  const lastExamDate = lastExam?.signedAt ?? lastExam?.completedAt ?? null
                  const recall = e.recalls[0]
                  const wp = e.workplaceAssignments[0]?.workplace

                  let recallUrgency: 'overdue' | 'soon' | 'ok' | null = null
                  if (recall) {
                    const diffDays = Math.floor(
                      (new Date(recall.dueDate).getTime() - Date.now()) / 86400000
                    )
                    if (recall.status === 'overdue' || diffDays < 0) recallUrgency = 'overdue'
                    else if (diffDays <= 30) recallUrgency = 'soon'
                    else recallUrgency = 'ok'
                  }

                  return (
                    <TableRow key={e.id} className="group">
                      {/* Nume + matricolă */}
                      <TableCell className="pl-4 py-3">
                        <Link
                          href={`/employees/${e.id}`}
                          className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
                        >
                          <span className="block truncate max-w-[160px]">
                            {e.lastName} {e.firstName}
                          </span>
                        </Link>
                        {e.companyEmployeeId && (
                          <span className="text-[10px] text-[hsl(var(--text-faint))] font-mono tabular-nums">
                            #{e.companyEmployeeId}
                          </span>
                        )}
                      </TableCell>

                      {/* Companie */}
                      <TableCell className="py-3">
                        <span className="block truncate max-w-[130px] text-sm text-[hsl(var(--text-muted))]">
                          {e.company?.name ?? '—'}
                        </span>
                      </TableCell>

                      {/* Funcție */}
                      <TableCell className="py-3">
                        <span className="block truncate max-w-[120px] text-sm text-[hsl(var(--text-muted))]">
                          {e.jobTitle ?? '—'}
                        </span>
                      </TableCell>

                      {/* Ultima examinare */}
                      <TableCell className="py-3">
                        {lastExamDate ? (
                          <span className="text-sm tabular-nums text-[hsl(var(--text-muted))]">
                            {formatDate(lastExamDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                          </span>
                        ) : (
                          <span className="text-sm text-[hsl(var(--text-faint))]">—</span>
                        )}
                      </TableCell>

                      {/* Scadență recall */}
                      <TableCell className="py-3">
                        {recall ? (
                          recallUrgency === 'overdue' ? (
                            <span className="inline-flex items-center gap-1.5 rounded border border-red-200/70 bg-red-50/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-red-900">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" aria-hidden />
                              {formatDate(recall.dueDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                            </span>
                          ) : recallUrgency === 'soon' ? (
                            <span className="inline-flex items-center gap-1.5 rounded border border-amber-200/70 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-900">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                              {formatDate(recall.dueDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                            </span>
                          ) : (
                            <span className="text-sm tabular-nums text-[hsl(var(--text-muted))]">
                              {formatDate(recall.dueDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                            </span>
                          )
                        ) : (
                          <span className="text-sm text-[hsl(var(--text-faint))]">—</span>
                        )}
                      </TableCell>

                      {/* Loc de muncă */}
                      <TableCell className="py-3 pr-4">
                        {wp ? (
                          <span className="block truncate max-w-[120px] text-sm text-[hsl(var(--text-muted))]">
                            {wp.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded border border-amber-200/70 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                            {t('employees.noWorkplace')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {sortedEmployees.map((e) => {
              const lastExam = e.examinations[0]
              const lastExamDate = lastExam?.signedAt ?? lastExam?.completedAt ?? null
              const recall = e.recalls[0]
              const wp = e.workplaceAssignments[0]?.workplace

              let recallUrgency: 'overdue' | 'soon' | 'ok' | null = null
              if (recall) {
                const diffDays = Math.floor(
                  (new Date(recall.dueDate).getTime() - Date.now()) / 86400000
                )
                if (recall.status === 'overdue' || diffDays < 0) recallUrgency = 'overdue'
                else if (diffDays <= 30) recallUrgency = 'soon'
                else recallUrgency = 'ok'
              }

              return (
                <Link
                  key={e.id}
                  href={`/employees/${e.id}`}
                  className="block border rounded-lg p-4 hover:bg-[hsl(var(--surface-tinted))] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">
                        {e.lastName} {e.firstName}
                      </div>
                      {e.companyEmployeeId && (
                        <div className="text-[10px] text-[hsl(var(--text-faint))] font-mono tabular-nums">
                          #{e.companyEmployeeId}
                        </div>
                      )}
                      <div className="mt-1 space-y-0.5">
                        {e.company?.name && (
                          <div className="text-xs text-[hsl(var(--text-muted))] truncate">
                            {e.company.name}
                          </div>
                        )}
                        {e.jobTitle && (
                          <div className="text-xs text-[hsl(var(--text-muted))] truncate">
                            {e.jobTitle}
                          </div>
                        )}
                        {wp ? (
                          <div className="text-xs text-[hsl(var(--text-muted))] truncate">
                            📍 {wp.name}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 mt-0.5">
                            <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                            {t('employees.noWorkplace')}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Right side — dates */}
                    <div className="shrink-0 text-right space-y-1.5">
                      {showArchived ? (
                        <div className="text-xs text-[hsl(var(--text-muted))] tabular-nums">
                          {e.archivedAt
                            ? formatDate(e.archivedAt, 'short', locale === 'ro' ? 'ro' : 'en')
                            : '—'}
                        </div>
                      ) : (
                        <>
                          {lastExamDate && (
                            <div className="text-[10px] text-[hsl(var(--text-faint))] tabular-nums">
                              {formatDate(lastExamDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                            </div>
                          )}
                          {recall ? (
                            <div className={`text-[11px] font-medium tabular-nums ${
                              recallUrgency === 'overdue' ? 'text-red-700'
                              : recallUrgency === 'soon' ? 'text-amber-700'
                              : 'text-[hsl(var(--text-muted))]'
                            }`}>
                              ⏱ {formatDate(recall.dueDate, 'short', locale === 'ro' ? 'ro' : 'en')}
                            </div>
                          ) : null}
                        </>
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

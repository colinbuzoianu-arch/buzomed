import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { EmployeeSearchInput } from './employee-search-input'
import { WorkplaceFilter } from '@/components/employees/workplace-filter'
import { CompanyFilter } from '@/components/employees/company-filter'
import { RecallFilter } from '@/components/employees/recall-filter'
import { EmployeesHeaderActions } from './employees-header-actions'
import { EmployeesBulkTable } from './employees-bulk-table'

interface PageProps {
  searchParams: Promise<{
    archived?: string
    q?: string
    wp?: string
    company?: string
    recall?: string
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
  const companyFilter = params.company ?? ''
  const recallFilter = params.recall ?? ''
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

  const now = new Date()
  const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const recallWhere: Prisma.EmployeeWhereInput =
    recallFilter === 'overdue'
      ? { recalls: { some: { deletedAt: null, OR: [
          { status: 'overdue' },
          { dueDate: { lt: now }, status: { in: ['pending', 'scheduled'] } },
        ] } } }
      : recallFilter === 'soon'
        ? { recalls: { some: { deletedAt: null, status: { in: ['pending', 'scheduled'] }, dueDate: { gte: now, lte: soonThreshold } } } }
        : recallFilter === 'ok'
          ? { recalls: { some: { deletedAt: null, status: { in: ['pending', 'scheduled'] }, dueDate: { gt: soonThreshold } } } }
          : recallFilter === 'none'
            ? { recalls: { none: { deletedAt: null, status: { in: ['pending', 'scheduled', 'overdue'] } } } }
            : {}

  const [employees, workplacesForFilter, companiesForFilter] = await Promise.all([
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
                { company: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(wpFilter === 'no_workplace'
          ? { workplaceAssignments: { none: { isCurrent: true } } }
          : wpFilter
            ? { workplaceAssignments: { some: { workplaceId: wpFilter, isCurrent: true, endDate: null } } }
            : {}),
        ...(companyFilter ? { companyId: companyFilter } : {}),
        ...recallWhere,
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
    prisma.company.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
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

  // Serialize dates so the client component receives plain strings (RSC serialization requirement)
  const serializedEmployees = sortedEmployees.map((e) => ({
    ...e,
    archivedAt:   e.archivedAt   ? e.archivedAt.toISOString()   : null,
    examinations: e.examinations.map((ex) => ({
      completedAt: ex.completedAt ? ex.completedAt.toISOString() : null,
      signedAt:    ex.signedAt    ? ex.signedAt.toISOString()    : null,
      status:      ex.status,
    })),
    recalls: e.recalls.map((r) => ({
      dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().slice(0, 10) : String(r.dueDate),
      status:  r.status,
    })),
  }))

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
            <EmployeesHeaderActions
              canWrite={caps.canWriteAdministrative}
              newEmployeeLabel={t('employees.newButton')}
              newVaccinationLabel={t('vaccinations.newButton')}
            />
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

        {/* Filtru companie */}
        <CompanyFilter
          companies={companiesForFilter}
          currentValue={companyFilter}
        />

        {/* Filtru workplace — ascuns pe archived tab */}
        {!showArchived && (
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

        {/* Filtru scadență recall — ascuns pe archived tab */}
        {!showArchived && (
          <RecallFilter currentValue={recallFilter} />
        )}

        {/* Badge filtre active */}
        {companyFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(wpFilter ? [['wp', wpFilter]] : []),
              ...(recallFilter ? [['recall', recallFilter]] : []),
              ...(sortRaw !== 'name_asc' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>{companiesForFilter.find((c) => c.id === companyFilter)?.name ?? 'Companie'}</span>
            <span aria-hidden className="ml-0.5">×</span>
          </Link>
        )}
        {wpFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(companyFilter ? [['company', companyFilter]] : []),
              ...(recallFilter ? [['recall', recallFilter]] : []),
              ...(sortRaw !== 'name_asc' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {wpFilter === 'no_workplace'
                ? 'Fără loc de muncă'
                : workplacesForFilter.find((w) => w.id === wpFilter)?.name ?? t('employees.search.workplacePlaceholder')}
            </span>
            <span aria-hidden className="ml-0.5">×</span>
          </Link>
        )}
        {recallFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(companyFilter ? [['company', companyFilter]] : []),
              ...(wpFilter ? [['wp', wpFilter]] : []),
              ...(sortRaw !== 'name_asc' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {recallFilter === 'overdue' ? 'Depășite'
                : recallFilter === 'soon' ? 'Scadente în curând'
                : recallFilter === 'ok' ? 'La zi'
                : 'Fără scadență'}
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
        <EmployeesBulkTable
          employees={serializedEmployees}
          workplaces={workplacesForFilter}
          locale={locale === 'ro' ? 'ro' : 'en'}
          sort={sort}
          showArchived={showArchived}
          canWrite={caps.canWriteAdministrative}
        />
      )}
    </div>
  )
}

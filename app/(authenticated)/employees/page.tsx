import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CompanyFilter } from '@/components/employees/company-filter'
import { EmployeeOverviewStrip } from '@/components/employees/employee-overview-strip'
import { RecallFilter } from '@/components/employees/recall-filter'
import { WorkplaceFilter } from '@/components/employees/workplace-filter'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { EmployeeSearchInput } from './employee-search-input'
import { EmployeesBulkTable } from './employees-bulk-table'
import { EmployeesHeaderActions } from './employees-header-actions'

const EMPLOYEES_PATH = '/employees'
const PAGE_SIZE = 100

interface PageProps {
  searchParams: Promise<{
    archived?: string
    q?: string
    wp?: string
    company?: string
    recall?: string
    status?: string
    sort?: string
    page?: string
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
  const statusFilter = params.status ?? ''
  const sortRaw = params.sort ?? 'priority'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  type DbSortKey =
    | 'name_asc'
    | 'name_desc'
    | 'company_asc'
    | 'company_desc'
    | 'jobTitle_asc'
    | 'jobTitle_desc'
  type ClientSortKey =
    | 'priority'
    | 'lastExam_asc'
    | 'lastExam_desc'
    | 'recall_asc'
    | 'recall_desc'
    | 'workplace_asc'
    | 'workplace_desc'
  type SortKey = DbSortKey | ClientSortKey

  const VALID_SORTS: SortKey[] = [
    'priority',
    'name_asc',
    'name_desc',
    'company_asc',
    'company_desc',
    'jobTitle_asc',
    'jobTitle_desc',
    'lastExam_asc',
    'lastExam_desc',
    'recall_asc',
    'recall_desc',
    'workplace_asc',
    'workplace_desc',
  ]

  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : 'priority'

  const dbOrderBy: Record<DbSortKey, Prisma.EmployeeOrderByWithRelationInput[]> = {
    name_asc: [{ lastName: 'asc' }, { firstName: 'asc' }],
    name_desc: [{ lastName: 'desc' }, { firstName: 'desc' }],
    company_asc: [{ company: { name: 'asc' } }, { lastName: 'asc' }],
    company_desc: [{ company: { name: 'desc' } }, { lastName: 'asc' }],
    jobTitle_asc: [{ jobTitle: 'asc' }, { lastName: 'asc' }],
    jobTitle_desc: [{ jobTitle: 'desc' }, { lastName: 'asc' }],
  }

  const isClientSort = !Object.keys(dbOrderBy).includes(sort)
  const orderBy = isClientSort ? dbOrderBy.name_asc : dbOrderBy[sort as DbSortKey]

  const now = new Date()
  const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Reusable where-fragments — shared by the list filters AND the overview
  // tile counts so a tile's count always matches the list it links to.
  const overdueWhere: Prisma.EmployeeWhereInput = {
    recalls: {
      some: {
        deletedAt: null,
        OR: [
          { status: 'overdue' },
          { dueDate: { lt: now }, status: { in: ['pending', 'scheduled'] } },
        ],
      },
    },
  }
  const soonWhere: Prisma.EmployeeWhereInput = {
    recalls: {
      some: {
        deletedAt: null,
        status: { in: ['pending', 'scheduled'] },
        dueDate: { gte: now, lte: soonThreshold },
      },
    },
  }
  // "No examination" = no completed, non-deleted examination on file.
  const neverWhere: Prisma.EmployeeWhereInput = {
    examinations: { none: { status: 'completed', deletedAt: null } },
  }
  const noWorkplaceWhere: Prisma.EmployeeWhereInput = {
    workplaceAssignments: { none: { isCurrent: true } },
  }
  // "Missing data for the certificate": job title empty OR no identity number.
  // Identity-number presence mirrors lib/employees/resolve-cnp.ts — present if
  // cnpEncrypted OR idDocumentNumber is set (never decrypt here).
  const missingDataWhere: Prisma.EmployeeWhereInput = {
    OR: [
      { jobTitle: null },
      { jobTitle: '' },
      { cnpEncrypted: null, idDocumentNumber: null },
    ],
  }

  const recallWhere: Prisma.EmployeeWhereInput =
    recallFilter === 'overdue'
      ? overdueWhere
      : recallFilter === 'soon'
        ? soonWhere
        : recallFilter === 'ok'
          ? {
              recalls: {
                some: {
                  deletedAt: null,
                  status: { in: ['pending', 'scheduled'] },
                  dueDate: { gt: soonThreshold },
                },
              },
            }
          : recallFilter === 'none'
            ? {
                recalls: {
                  none: { deletedAt: null, status: { in: ['pending', 'scheduled', 'overdue'] } },
                },
              }
            : {}

  // New status filter (set only by the overview tiles).
  const statusWhere: Prisma.EmployeeWhereInput =
    statusFilter === 'never'
      ? neverWhere
      : statusFilter === 'missing_data'
        ? missingDataWhere
        : {}

  const employeeWhere: Prisma.EmployeeWhereInput = {
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
        ? {
            workplaceAssignments: {
              some: { workplaceId: wpFilter, isCurrent: true, endDate: null },
            },
          }
        : {}),
    ...(companyFilter ? { companyId: companyFilter } : {}),
    ...recallWhere,
    ...statusWhere,
  }

  // Overview tile counts: tenant's active, non-deleted employees, respecting
  // only the company filter (so the numbers stay stable as other filters
  // change). Not computed on the archived tab, where the strip is hidden.
  const countBase: Prisma.EmployeeWhereInput = {
    tenantId: user.tenantId,
    deletedAt: null,
    archivedAt: null,
    ...(companyFilter ? { companyId: companyFilter } : {}),
  }

  // DB-level pagination only applies to the 6 simple (DB-orderable) sorts.
  // The 3 join-derived sorts (lastExam/recall/workplace) need the full
  // filtered set fetched to sort correctly in memory — degrading those to
  // "no pagination" (full result, unchanged from before) rather than
  // producing subtly-wrong paginated results.
  const [employees, employeeTotal, workplacesForFilter, companiesForFilter, overviewCounts] =
    await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      orderBy,
      ...(isClientSort ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        companyEmployeeId: true,
        isActive: true,
        archivedAt: true,
        cnpEncrypted: true,
        idDocumentNumber: true,
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
    isClientSort ? Promise.resolve(null) : prisma.employee.count({ where: employeeWhere }),
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
    showArchived
      ? Promise.resolve(null)
      : Promise.all([
          prisma.employee.count({ where: countBase }),
          prisma.employee.count({ where: { ...countBase, ...overdueWhere } }),
          prisma.employee.count({ where: { ...countBase, ...soonWhere } }),
          prisma.employee.count({ where: { ...countBase, ...neverWhere } }),
          prisma.employee.count({ where: { ...countBase, ...noWorkplaceWhere } }),
          prisma.employee.count({ where: { ...countBase, ...missingDataWhere } }),
        ]).then(([activi, overdue, soon, never, noWorkplace, missingData]) => ({
          activi,
          overdue,
          soon,
          never,
          noWorkplace,
          missingData,
        })),
  ])

  // Client-side sort for columns that can't be ordered in DB (join-dependent)
  let sortedEmployees = [...employees]

  if (sort === 'priority') {
    // Default triage order: overdue (most overdue first) → soon (soonest
    // first) → never examined → ok (soonest due first) → none; ties by name.
    const nowMs = now.getTime()
    const soonMs = soonThreshold.getTime()
    const rank = (e: (typeof employees)[number]): { bucket: number; key: number } => {
      const recall = e.recalls[0]
      const hasExam = e.examinations.length > 0
      if (recall) {
        const due = new Date(recall.dueDate).getTime()
        if (recall.status === 'overdue' || due < nowMs) return { bucket: 0, key: due }
        if (due <= soonMs) return { bucket: 1, key: due }
        if (!hasExam) return { bucket: 2, key: 0 }
        return { bucket: 3, key: due }
      }
      if (!hasExam) return { bucket: 2, key: 0 }
      return { bucket: 4, key: 0 }
    }
    sortedEmployees.sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra.bucket !== rb.bucket) return ra.bucket - rb.bucket
      if (ra.key !== rb.key) return ra.key - rb.key
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ro')
    })
  } else if (sort === 'lastExam_asc' || sort === 'lastExam_desc') {
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

  const totalPages = employeeTotal !== null ? Math.ceil(employeeTotal / PAGE_SIZE) : null

  // Serialize dates so the client component receives plain strings (RSC
  // serialization requirement). Identity-number presence is reduced to a
  // boolean here — the encrypted CNP is never sent to the client.
  const serializedEmployees = sortedEmployees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    jobTitle: e.jobTitle,
    companyEmployeeId: e.companyEmployeeId,
    isActive: e.isActive,
    company: e.company,
    workplaceAssignments: e.workplaceAssignments,
    hasIdNumber: Boolean(e.cnpEncrypted) || Boolean(e.idDocumentNumber),
    archivedAt: e.archivedAt ? e.archivedAt.toISOString() : null,
    examinations: e.examinations.map((ex) => ({
      completedAt: ex.completedAt ? ex.completedAt.toISOString() : null,
      signedAt: ex.signedAt ? ex.signedAt.toISOString() : null,
      status: ex.status,
    })),
    recalls: e.recalls.map((r) => ({
      dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().slice(0, 10) : String(r.dueDate),
      status: r.status,
    })),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
            {t('employees.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('employees.subtitle')}
          </p>
        </div>
        {caps.canWriteAdministrative && !showArchived && (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/employees/import">{t('employees.importButton')}</Link>
            </Button>
            {(user.roles.includes('practice_admin') || user.roles.includes('practitioner')) && (
              <Button asChild variant="outline" size="sm">
                <Link href="/employees/import/history">
                  {t('employees.import.importHistoryLink')}
                </Link>
              </Button>
            )}
            <EmployeesHeaderActions
              canWrite={caps.canWriteAdministrative}
              newEmployeeLabel={t('employees.newButton')}
              newVaccinationLabel={t('vaccinations.newButton')}
              mergeLabel={t('employees.merge.title')}
            />
          </div>
        )}
      </div>

      {!showArchived && overviewCounts && (
        <EmployeeOverviewStrip
          counts={overviewCounts}
          recall={recallFilter}
          status={statusFilter}
          wp={wpFilter}
          labels={{
            activi: t('employees.overview.activi'),
            overdue: t('employees.overview.overdue'),
            soon: t('employees.overview.soon'),
            never: t('employees.overview.never'),
            noWorkplace: t('employees.overview.noWorkplace'),
            missingData: t('employees.overview.missingData'),
          }}
        />
      )}

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
        <EmployeeSearchInput defaultValue={q} placeholder={t('employees.search.placeholder')} />

        {/* Filtru companie */}
        <CompanyFilter companies={companiesForFilter} currentValue={companyFilter} />

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
        {!showArchived && <RecallFilter currentValue={recallFilter} />}

        {/* Badge filtre active */}
        {companyFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(wpFilter ? [['wp', wpFilter]] : []),
              ...(recallFilter ? [['recall', recallFilter]] : []),
              ...(statusFilter ? [['status', statusFilter]] : []),
              ...(sortRaw !== 'priority' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {companiesForFilter.find((c) => c.id === companyFilter)?.name ?? 'Companie'}
            </span>
            <span aria-hidden className="ml-0.5">
              ×
            </span>
          </Link>
        )}
        {wpFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(companyFilter ? [['company', companyFilter]] : []),
              ...(recallFilter ? [['recall', recallFilter]] : []),
              ...(statusFilter ? [['status', statusFilter]] : []),
              ...(sortRaw !== 'priority' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {wpFilter === 'no_workplace'
                ? 'Fără loc de muncă'
                : (workplacesForFilter.find((w) => w.id === wpFilter)?.name ??
                  t('employees.search.workplacePlaceholder'))}
            </span>
            <span aria-hidden className="ml-0.5">
              ×
            </span>
          </Link>
        )}
        {recallFilter && (
          <Link
            href={`/employees?${new URLSearchParams([
              ...(showArchived ? [['archived', '1']] : []),
              ...(q ? [['q', q]] : []),
              ...(companyFilter ? [['company', companyFilter]] : []),
              ...(wpFilter ? [['wp', wpFilter]] : []),
              ...(statusFilter ? [['status', statusFilter]] : []),
              ...(sortRaw !== 'priority' ? [['sort', sortRaw]] : []),
            ]).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[hsl(var(--surface-tinted))] px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span>
              {recallFilter === 'overdue'
                ? 'Depășite'
                : recallFilter === 'soon'
                  ? 'Scadente în curând'
                  : recallFilter === 'ok'
                    ? 'La zi'
                    : 'Fără scadență'}
            </span>
            <span aria-hidden className="ml-0.5">
              ×
            </span>
          </Link>
        )}
      </div>

      {employees.length === 0 ? (
        <EmptyState
          illustration="employees"
          title={showArchived ? t('employees.emptyTitleArchived') : t('employees.emptyTitle')}
          description={
            showArchived ? t('employees.emptyDescriptionArchived') : t('employees.emptyDescription')
          }
          primaryAction={
            caps.canWriteAdministrative && !showArchived
              ? { label: `+ ${t('employees.newButton')}`, href: '/employees/new' }
              : undefined
          }
          secondaryAction={
            caps.canWriteAdministrative && !showArchived
              ? {
                  label: t('employees.importButton'),
                  href: '/employees/import',
                  variant: 'outline',
                }
              : undefined
          }
        />
      ) : (
        <EmployeesBulkTable
          employees={serializedEmployees}
          workplaces={workplacesForFilter}
          locale={locale === 'ro' ? 'ro' : 'en'}
          sort={sort}
          showArchived={showArchived}
          canWrite={caps.canWriteAdministrative}
          labels={{
            overdue: t('employees.statusCol.overdue'),
            soon: t('employees.statusCol.soon'),
            ok: t('employees.statusCol.ok'),
            never: t('employees.statusCol.never'),
            none: t('employees.statusCol.none'),
            funcMissing: t('employees.statusCol.funcMissing'),
            cnpMissing: t('employees.statusCol.cnpMissing'),
            newExam: t('employees.statusCol.newExam'),
            lastExam: t('employees.statusCol.lastExam'),
            due: t('employees.statusCol.due'),
          }}
        />
      )}

      {totalPages !== null && (
        <Pagination
          href={EMPLOYEES_PATH}
          params={params}
          paramName="page"
          page={page}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}

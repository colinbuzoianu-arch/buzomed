import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmployeeSearchInput } from './employee-search-input'

interface PageProps {
  searchParams: Promise<{ archived?: string; q?: string }>
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

  const employees = await prisma.employee.findMany({
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
    },
  })

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
        <EmployeeSearchInput
          defaultValue={q}
          placeholder={t('employees.search.placeholder')}
        />
      </div>

      {employees.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 sm:p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? t('employees.emptyArchived')
              : t('employees.empty')}
          </p>
          {caps.canWriteAdministrative && !showArchived && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Button asChild variant="outline">
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
                    <TableHead>{t('common.status')}</TableHead>
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
                          ? dateFormatter.format(e.archivedAt)
                          : '—'}
                      </TableCell>
                    ) : (
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm ${
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
                      {e.city && (
                        <div className="truncate">{e.city}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {showArchived ? (
                      <span className="text-xs text-muted-foreground">
                        {e.archivedAt
                          ? dateFormatter.format(e.archivedAt)
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

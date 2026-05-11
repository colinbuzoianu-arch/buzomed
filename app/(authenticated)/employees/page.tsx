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

interface PageProps {
  searchParams: Promise<{ archived?: string }>
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

  const employees = await prisma.employee.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(showArchived ? { archivedAt: { not: null } } : { archivedAt: null }),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idDocumentType: true,
      idDocumentNumber: true,
      companyEmployeeId: true,
      isActive: true,
      archivedAt: true,
    },
  })

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('employees.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('employees.subtitle')}
          </p>
        </div>
        {caps.canWrite && !showArchived && (
          <Button asChild>
            <Link href="/employees/new">+ {t('employees.newButton')}</Link>
          </Button>
        )}
      </div>

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
          href="/employees?archived=1"
          className={`px-3 py-1 rounded-md border ${
            showArchived ? 'bg-secondary' : 'hover:bg-muted'
          }`}
        >
          {t('employees.tabs.archived')}
        </Link>
      </div>

      {employees.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? t('employees.emptyArchived')
              : t('employees.empty')}
          </p>
          {caps.canWrite && !showArchived && (
            <Button asChild className="mt-4">
              <Link href="/employees/new">+ {t('employees.newButton')}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('employees.table.idDocument')}</TableHead>
                <TableHead>{t('employees.table.companyEmployeeId')}</TableHead>
                {showArchived ? (
                  <TableHead>{t('employees.table.archivedAt')}</TableHead>
                ) : (
                  <TableHead>{t('common.status')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
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
                    {e.idDocumentNumber
                      ? `${e.idDocumentType}: ${e.idDocumentNumber}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {e.companyEmployeeId ?? '—'}
                  </TableCell>
                  {showArchived ? (
                    <TableCell className="text-muted-foreground text-sm">
                      {e.archivedAt ? dateFormatter.format(e.archivedAt) : '—'}
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
                            e.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                          }`}
                        />
                        {e.isActive
                          ? t('common.active')
                          : t('common.inactive')}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

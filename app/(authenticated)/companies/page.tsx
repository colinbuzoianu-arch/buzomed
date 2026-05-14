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

export default async function CompaniesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const companies = await prisma.company.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      cui: true,
      city: true,
      contactPersonName: true,
      isActive: true,
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {t('companies.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('companies.subtitle')}
          </p>
        </div>
        {caps.canWriteAdministrative && (
          <Button asChild>
            <Link href="/companies/new">+ {t('companies.newButton')}</Link>
          </Button>
        )}
      </div>

      {companies.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 sm:p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {t('companies.empty')}
          </p>
          {caps.canWriteAdministrative && (
            <Button asChild className="mt-4">
              <Link href="/companies/new">+ {t('companies.newButton')}</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('companies.table.name')}</TableHead>
                  <TableHead>{t('companies.table.cui')}</TableHead>
                  <TableHead>{t('common.city')}</TableHead>
                  <TableHead>{t('companies.table.contact')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/companies/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.cui ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.city ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.contactPersonName ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 text-sm ${
                          c.isActive
                            ? 'text-green-700'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.isActive
                              ? 'bg-green-600'
                              : 'bg-muted-foreground'
                          }`}
                        />
                        {c.isActive
                          ? t('common.active')
                          : t('common.inactive')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="block border rounded-lg p-4 hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {c.cui && <div className="truncate">CUI: {c.cui}</div>}
                      {c.city && (
                        <div className="truncate">
                          {t('common.city')}: {c.city}
                        </div>
                      )}
                      {c.contactPersonName && (
                        <div className="truncate">{c.contactPersonName}</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        c.isActive
                          ? 'text-green-700'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          c.isActive
                            ? 'bg-green-600'
                            : 'bg-muted-foreground'
                        }`}
                      />
                      {c.isActive
                        ? t('common.active')
                        : t('common.inactive')}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

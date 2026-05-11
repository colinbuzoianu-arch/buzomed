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

/**
 * Companies list for tenant users.
 *
 * super_admin is bounced to /super-admin (their world). Users without a
 * tenant get sent home — same defensive pattern as /team.
 *
 * Assistants can read but the "New" button is hidden via canWrite.
 */
export default async function CompaniesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) {
    redirect('/super-admin')
  }
  if (!user.tenantId) {
    redirect('/')
  }

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) {
    redirect('/')
  }

  const companies = await prisma.company.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
    },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('companies.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('companies.subtitle')}
          </p>
        </div>
        {caps.canWrite && (
          <Button asChild>
            <Link href="/companies/new">+ {t('companies.newButton')}</Link>
          </Button>
        )}
      </div>

      {companies.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {t('companies.empty')}
          </p>
          {caps.canWrite && (
            <Button asChild className="mt-4">
              <Link href="/companies/new">+ {t('companies.newButton')}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg">
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
                        c.isActive ? 'text-green-700' : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          c.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                        }`}
                      />
                      {c.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

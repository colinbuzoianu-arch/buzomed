import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function SuperAdminPage() {
  await requireRole('super_admin')
  const locale = await getLocale()
  const t = getTranslator(locale)

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('superAdmin.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('superAdmin.subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/super-admin/tenants/new">+ {t('superAdmin.createTenant')}</Link>
        </Button>
      </div>

      {tenants.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground">{t('superAdmin.noTenants')}</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('superAdmin.tenantsTable.name')}</TableHead>
                <TableHead>{t('superAdmin.tenantsTable.city')}</TableHead>
                <TableHead>{t('superAdmin.tenantsTable.subscription')}</TableHead>
                <TableHead>{t('superAdmin.tenantsTable.status')}</TableHead>
                <TableHead>{t('common.createdAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>{tenant.city || '—'}</TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {t(`superAdmin.subscription.${tenant.subscriptionTier}`)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm ${
                        tenant.subscriptionStatus === 'active'
                          ? 'text-green-700'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tenant.subscriptionStatus === 'active'
                            ? 'bg-green-600'
                            : 'bg-gray-400'
                        }`}
                      />
                      {tenant.subscriptionStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-US', {
                      dateStyle: 'medium',
                    }).format(tenant.createdAt)}
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

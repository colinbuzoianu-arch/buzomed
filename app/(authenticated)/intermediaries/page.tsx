import Link from 'next/link'
import { redirect } from 'next/navigation'
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
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

export default async function IntermediariesPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const intermediaries = await prisma.intermediary.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      cui: true,
      city: true,
      isActive: true,
      _count: {
        select: { companies: { where: { deletedAt: null } } },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
            {t('intermediaries.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('intermediaries.subtitle')}
          </p>
        </div>
        {caps.canWriteAdministrative && (
          <Button asChild>
            <Link href="/intermediaries/new">+ {t('intermediaries.newButton')}</Link>
          </Button>
        )}
      </div>

      {intermediaries.length === 0 ? (
        <EmptyState
          illustration="generic"
          title={t('intermediaries.emptyTitle')}
          description={t('intermediaries.emptyDescription')}
          primaryAction={
            caps.canWriteAdministrative
              ? { label: `+ ${t('intermediaries.newButton')}`, href: '/intermediaries/new' }
              : undefined
          }
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                  {t('intermediaries.table.name')}
                </TableHead>
                <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                  {t('intermediaries.table.cui')}
                </TableHead>
                <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                  {t('common.city')}
                </TableHead>
                <TableHead className="text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                  {t('intermediaries.table.companies')}
                </TableHead>
                <TableHead className="text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                  {t('common.status')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intermediaries.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">
                    <Link href={`/intermediaries/${i.id}`} className="hover:underline">
                      {i.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[hsl(var(--text-muted))] text-sm tabular-nums">
                    {i.cui ?? '—'}
                  </TableCell>
                  <TableCell className="text-[hsl(var(--text-muted))] text-sm">
                    {i.city ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-foreground">
                    {i._count.companies}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={i.isActive ? 'text-green-700' : 'text-muted-foreground'}>
                      {i.isActive ? t('common.active') : t('common.inactive')}
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

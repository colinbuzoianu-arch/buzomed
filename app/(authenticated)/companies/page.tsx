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

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarPalette(name: string): string {
  const palettes = [
    'bg-blue-50 text-blue-800',
    'bg-emerald-50 text-emerald-800',
    'bg-amber-50 text-amber-800',
    'bg-violet-50 text-violet-800',
    'bg-rose-50 text-rose-800',
    'bg-teal-50 text-teal-800',
    'bg-indigo-50 text-indigo-800',
    'bg-orange-50 text-orange-800',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return palettes[Math.abs(hash) % palettes.length]
}

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
      createdFromImport: true,
      _count: {
        select: {
          employees: {
            where: { archivedAt: null, deletedAt: null },
          },
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
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
        <EmptyState
          illustration="companies"
          title={t('companies.emptyTitle')}
          description={t('companies.emptyDescription')}
          primaryAction={caps.canWriteAdministrative ? { label: `+ ${t('companies.newButton')}`, href: '/companies/new' } : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                    {t('companies.table.name')}
                  </TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                    {t('companies.table.cui')}
                  </TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                    {t('common.city')}
                  </TableHead>
                  <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                    {t('companies.table.contact')}
                  </TableHead>
                  <TableHead className="text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                    {t('companies.table.employees')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="font-medium">
                      <Link
                        href={`/companies/${c.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <span
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${avatarPalette(c.name)}`}
                          aria-hidden
                        >
                          {companyInitials(c.name)}
                        </span>
                        <span className="min-w-0 truncate">{c.name}</span>
                        {c.createdFromImport && (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                            <span className="h-1 w-1 rounded-full bg-teal-500" aria-hidden />
                            Creat din import
                          </span>
                        )}
                        {!c.isActive && (
                          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            <span className="h-1 w-1 rounded-full bg-slate-400" aria-hidden />
                            {t('common.inactive')}
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[hsl(var(--text-muted))] text-sm tabular-nums">
                      {c.cui ?? '—'}
                    </TableCell>
                    <TableCell className="text-[hsl(var(--text-muted))] text-sm">
                      {c.city ?? '—'}
                    </TableCell>
                    <TableCell className="text-[hsl(var(--text-muted))] text-sm">
                      {c.contactPersonName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-foreground">
                      {c._count.employees.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB')}
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
                className="block border rounded-lg p-4 hover:bg-[hsl(var(--surface-tinted))] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${avatarPalette(c.name)}`}
                    aria-hidden
                  >
                    {companyInitials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{c.name}</span>
                      {c.createdFromImport && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                          <span className="h-1 w-1 rounded-full bg-teal-500" aria-hidden />
                          Creat din import
                        </span>
                      )}
                      {!c.isActive && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          <span className="h-1 w-1 rounded-full bg-slate-400" aria-hidden />
                          {t('common.inactive')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[hsl(var(--text-muted))] mt-1 space-y-0.5 tabular-nums">
                      {c.cui && <div className="truncate">CUI: {c.cui}</div>}
                      {c.city && <div className="truncate">{t('common.city')}: {c.city}</div>}
                      {c.contactPersonName && <div className="truncate">{c.contactPersonName}</div>}
                      <div className="truncate text-foreground font-medium pt-0.5">
                        {c._count.employees.toLocaleString(locale === 'ro' ? 'ro-RO' : 'en-GB')} {t('companies.table.employees').toLowerCase()}
                      </div>
                    </div>
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

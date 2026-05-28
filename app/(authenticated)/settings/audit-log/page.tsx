import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/format-date'
import { getLocale } from '@/lib/i18n'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import type { AuditAction } from '@prisma/client'

export const metadata = { title: 'Jurnal acces — Buzomed' }

const ACTION_BADGE: Record<AuditAction, { label: string; cls: string }> = {
  read:     { label: 'Citire',      cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  download: { label: 'Descărcare',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  sign:     { label: 'Semnare',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  update:   { label: 'Modificare',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  delete:   { label: 'Ștergere',   cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  export:   { label: 'Export',      cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  create:   { label: 'Creare',      cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  print:    { label: 'Printare',    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  login:    { label: 'Autentificare', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  logout:   { label: 'Deconectare', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  import:   { label: 'Import',      cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
}

export default async function AuditLogPage() {
  const user = await requireUser()
  const locale = await getLocale()

  if (!user.tenantId || !user.roles.includes('practice_admin')) {
    redirect('/dashboard')
  }

  const entries = await prisma.auditLogEntry.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { occurredAt: 'desc' },
    take: 200,
    select: {
      id: true,
      action: true,
      entityType: true,
      entitySummary: true,
      occurredAt: true,
      ipAddress: true,
      user: { select: { firstName: true, lastName: true } },
    },
  })

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Setări', href: '/settings/practice' },
          { label: 'Jurnal acces' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold">Jurnal acces</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ultimele 200 de operațiuni pe date medicale ale cabinetului tău.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-muted-foreground text-sm">Nicio intrare în jurnal.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/30 text-xs tracking-wide border-b">
              <tr>
                <th className="text-left px-4 py-3 text-muted-foreground">Data/ora</th>
                <th className="text-left px-4 py-3 text-muted-foreground">Utilizator</th>
                <th className="text-left px-4 py-3 text-muted-foreground">Acțiune</th>
                <th className="text-left px-4 py-3 text-muted-foreground">Entitate</th>
                <th className="text-left px-4 py-3 text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(entry => {
                const badge = ACTION_BADGE[entry.action] ?? { label: entry.action, cls: 'bg-slate-100 text-slate-700' }
                return (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(entry.occurredAt, 'datetime', locale === 'ro' ? 'ro' : 'en')}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {entry.user
                        ? `${entry.user.lastName} ${entry.user.firstName}`
                        : <span className="text-muted-foreground italic">sistem</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      <span className="text-muted-foreground text-xs">{entry.entityType}</span>
                      {entry.entitySummary && (
                        <span className="ml-1.5 text-foreground">{entry.entitySummary}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {entry.ipAddress ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

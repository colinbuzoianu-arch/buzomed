import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Import history (spec §8) — practice_admin only, scoped to their tenant.
 * Lists every bulk-import ImportJob; each row links to the per-row detail.
 */

const HISTORY_LIMIT = 100

function ts(d: Date | string): string {
  return new Date(d).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-green-100 text-green-800'
      : status === 'cancelled'
        ? 'bg-slate-200 text-slate-700'
        : 'bg-amber-100 text-amber-800' // running / interrupted
  const label =
    status === 'completed' ? 'Finalizat' : status === 'cancelled' ? 'Anulat' : 'În curs / întrerupt'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export default async function ImportHistoryPage() {
  const user = await requireRole('practice_admin')
  if (!user.tenantId) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">
        Niciun cabinet asociat contului.
      </div>
    )
  }

  const jobs = await prisma.importJob.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      created: true,
      skipped: true,
      failed: true,
      companiesCreated: true,
      workplacesCreated: true,
      flags: true,
      createdAt: true,
      initiatedByUserId: true,
    },
  })

  // Resolve initiator names in one extra query (ImportJob has no user relation).
  const initiatorIds = Array.from(new Set(jobs.map((j) => j.initiatedByUserId)))
  const initiators = initiatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: initiatorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : []
  const nameById = new Map(
    initiators.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email])
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Istoric importuri</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Importurile de angajați din cabinetul tău. Click pe un import pentru detalii pe rând.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/employees/import">← Import nou</Link>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">Niciun import încă.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dată</TableHead>
                <TableHead>Fișier</TableHead>
                <TableHead>Inițiat de</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Create</TableHead>
                <TableHead className="text-right">Sărite</TableHead>
                <TableHead className="text-right">Eșuate</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const flags = (j.flags as string[] | null) ?? []
                return (
                  <TableRow key={j.id}>
                    <TableCell className="whitespace-nowrap text-xs">{ts(j.createdAt)}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {j.fileName ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {nameById.get(j.initiatedByUserId) ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                      {flags.length > 0 && (
                        <span className="ml-1 text-xs text-amber-700" title={flags.join(', ')}>
                          ⚑
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{j.totalRows}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-green-700">
                      {j.created}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{j.skipped}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-destructive">
                      {j.failed}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/employees/import/history/${j.id}`}
                        className="text-sm text-primary underline hover:no-underline"
                      >
                        Detalii →
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

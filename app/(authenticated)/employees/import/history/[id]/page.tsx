import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import { CancelImportButton } from './cancel-import-button'

/**
 * Import detail (spec §8) — per-row outcomes for one ImportJob, plus the
 * conservative "cancel import" action. practice_admin, own tenant only.
 */

interface RowResult {
  rowNumber: number
  outcome: 'created' | 'skipped' | 'failed'
  reason?: string
  warning?: string
  employeeId?: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

function ts(d: Date | string): string {
  return new Date(d).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  const v =
    tone === 'ok' && value > 0
      ? 'text-green-700'
      : tone === 'bad' && value > 0
        ? 'text-destructive'
        : ''
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${v}`}>{value}</div>
    </div>
  )
}

const OUTCOME_LABEL: Record<string, string> = {
  created: 'Creat',
  skipped: 'Sărit',
  failed: 'Eșuat',
}

export default async function ImportHistoryDetailPage({ params }: PageProps) {
  const user = await requireRole('practice_admin', 'practitioner')
  const { id } = await params
  if (!user.tenantId) notFound()

  const job = await prisma.importJob.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (!job) notFound()

  const results = ((job.results as RowResult[] | null) ?? []).sort(
    (a, b) => a.rowNumber - b.rowNumber
  )
  const flags = (job.flags as string[] | null) ?? []
  // Viewing is open to practitioners too, but cancelling an import is
  // destructive — keep it practice_admin-only (the API enforces this as well).
  const isPracticeAdmin = user.roles.includes('practice_admin')
  const canCancel = isPracticeAdmin && job.status !== 'cancelled' && job.created > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import {job.fileName ? `— ${job.fileName}` : ''}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ts(job.createdAt)} ·{' '}
            {job.status === 'completed'
              ? 'Finalizat'
              : job.status === 'cancelled'
                ? 'Anulat'
                : 'În curs / întrerupt'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/employees/import/history">← Istoric</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total rânduri" value={job.totalRows} />
        <StatCard label="Create" value={job.created} tone="ok" />
        <StatCard label="Sărite" value={job.skipped} />
        <StatCard label="Eșuate" value={job.failed} tone="bad" />
        <StatCard label="Companii create" value={job.companiesCreated} />
        <StatCard label="Locuri de muncă create" value={job.workplacesCreated} />
        <StatCard label="Fără companie" value={job.rowsWithoutCompany} />
        <StatCard label="Fără loc de muncă" value={job.rowsWithoutWorkplace} tone="bad" />
      </div>

      {flags.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-medium">Semnalări:</span> {flags.join(', ')}
        </div>
      )}

      {job.status === 'cancelled' && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Import anulat{job.cancelledAt ? ` la ${ts(job.cancelledAt)}` : ''} —{' '}
          {job.removedEmployeeCount ?? 0} angajați eliminați, {job.keptEmployeeCount ?? 0} păstrați
          (aveau examinări).
        </div>
      )}

      {canCancel && (
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Anulează importul</h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            Șterge (soft-delete) angajații creați de acest import care nu au încă examinări și
            rechemările lor importate. Angajații cu examinări se păstrează. Companiile și locurile
            de muncă rămân neatinse.
          </p>
          <CancelImportButton jobId={job.id} createdCount={job.created} />
        </div>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">
          Rezultat pe rând{' '}
          <span className="text-sm font-normal text-muted-foreground">({results.length})</span>
        </h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Fără detalii pe rând (import întrerupt înainte de salvare, sau anterior urmăririi).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Rând</TableHead>
                <TableHead className="w-28">Rezultat</TableHead>
                <TableHead>Motiv / avertisment</TableHead>
                <TableHead>Angajat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.rowNumber}>
                  <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs font-medium ${
                        r.outcome === 'created'
                          ? 'text-green-700'
                          : r.outcome === 'failed'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[r.reason, r.warning].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.employeeId ? (
                      <Link
                        href={`/employees/${r.employeeId}`}
                        className="text-primary underline hover:no-underline"
                      >
                        Deschide
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

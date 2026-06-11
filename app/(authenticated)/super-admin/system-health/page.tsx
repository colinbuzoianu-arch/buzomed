import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function ts(d: Date | string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
}

export default async function SystemHealthPage() {
  await requireRole('super_admin')

  const [errors, imports, failedDeliveries] = await Promise.all([
    prisma.systemErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.webhookDelivery.findMany({
      where: { success: false },
      orderBy: { attemptedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        event: true,
        responseStatus: true,
        responseBody: true,
        attemptedAt: true,
        endpoint: { select: { url: true, tenantId: true } },
      },
    }),
  ])

  const FLAG_LABELS: Record<string, { label: string; color: string }> = {
    workplace_data_present_but_unassigned: {
      label: 'Locuri de muncă neatribuite deși erau în fișier',
      color: 'bg-amber-100 text-amber-800',
    },
    zero_rows_created: {
      label: 'Niciun angajat creat',
      color: 'bg-red-100 text-red-800',
    },
    high_failure_rate: {
      label: 'Rată mare de eșec',
      color: 'bg-red-100 text-red-800',
    },
    unexpected_company_creation: {
      label: 'Companie nouă creată neașteptat',
      color: 'bg-amber-100 text-amber-800',
    },
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Erori recente, importuri și webhook-uri eșuate
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/super-admin">← Super Admin</Link>
        </Button>
      </div>

      {/* Section A — Recent errors */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-lg">
          Erori recente{' '}
          <span className="text-muted-foreground font-normal text-sm">
            (ultimele 50)
          </span>
        </h2>
        {errors.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nicio eroare înregistrată.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Tip eroare</TableHead>
                <TableHead>Mesaj</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {ts(e.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {e.tenantId ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{e.route}</TableCell>
                  <TableCell className="text-xs">{e.method}</TableCell>
                  <TableCell className="text-xs">{e.errorType}</TableCell>
                  <TableCell className="text-xs max-w-xs">
                    <details>
                      <summary className="cursor-pointer truncate max-w-xs">
                        {e.message.slice(0, 150)}
                      </summary>
                      <pre className="mt-2 text-xs whitespace-pre-wrap break-all bg-muted p-2 rounded">
                        {e.stackTrace ?? '(no stack)'}
                        {e.context
                          ? `\n\nContext: ${JSON.stringify(e.context, null, 2)}`
                          : ''}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Section B — Recent imports */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-lg">
          Importuri recente{' '}
          <span className="text-muted-foreground font-normal text-sm">
            (ultimele 30)
          </span>
        </h2>
        {imports.length === 0 ? (
          <p className="text-muted-foreground text-sm">Niciun import înregistrat.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Creat</TableHead>
                <TableHead className="text-right">Sărit</TableHead>
                <TableHead className="text-right">Eșuat</TableHead>
                <TableHead className="text-right">Companii noi</TableHead>
                <TableHead className="text-right">Locuri noi</TableHead>
                <TableHead>Flag-uri</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((job) => {
                const flags = Array.isArray(job.flags) ? (job.flags as string[]) : []
                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {ts(job.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{job.tenantId}</TableCell>
                    <TableCell className="text-right text-xs">{job.totalRows}</TableCell>
                    <TableCell className="text-right text-xs text-green-700">
                      {job.created}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {job.skipped}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-600">
                      {job.failed}
                    </TableCell>
                    <TableCell className="text-right text-xs">{job.companiesCreated}</TableCell>
                    <TableCell className="text-right text-xs">{job.workplacesCreated}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => {
                          const meta = FLAG_LABELS[f]
                          return (
                            <span
                              key={f}
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${meta?.color ?? 'bg-gray-100 text-gray-700'}`}
                            >
                              {meta?.label ?? f}
                            </span>
                          )
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Section C — Failed webhooks */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold text-lg">
          Webhook-uri eșuate{' '}
          <span className="text-muted-foreground font-normal text-sm">
            (ultimele 30)
          </span>
        </h2>
        {failedDeliveries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Niciun webhook eșuat înregistrat.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedDeliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {ts(d.attemptedAt)}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {d.endpoint.tenantId}
                  </TableCell>
                  <TableCell className="text-xs">{d.event}</TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-xs">
                    {d.endpoint.url.slice(0, 60)}
                    {d.endpoint.url.length > 60 ? '…' : ''}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.responseStatus ?? 'error'}
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

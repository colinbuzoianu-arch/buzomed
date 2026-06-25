import type { AuditAction } from '@prisma/client'
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
import { CsvExportButton } from './csv-export-button'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts(d: Date | string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
}

function aiCost(model: string, input: number, output: number, cacheRead: number): number {
  const inRate = model.includes('haiku') ? 0.8 : 3
  const outRate = model.includes('haiku') ? 4 : 15
  return (input * inRate + output * outRate + cacheRead * 0.3) / 1_000_000
}

function auditActionColor(action: string): string {
  switch (action) {
    case 'login':
      return 'bg-blue-100 text-blue-700'
    case 'logout':
      return 'bg-gray-100 text-gray-700'
    case 'delete':
      return 'bg-red-100 text-red-700'
    case 'create':
      return 'bg-green-100 text-green-700'
    case 'update':
      return 'bg-yellow-100 text-yellow-700'
    case 'export':
    case 'download':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'read',
  'update',
  'delete',
  'download',
  'print',
  'sign',
  'login',
  'logout',
  'export',
  'import',
]

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  workplace_data_present_but_unassigned: {
    label: 'Locuri neatribuite',
    color: 'bg-amber-100 text-amber-800',
  },
  zero_rows_created: { label: 'Niciun angajat creat', color: 'bg-red-100 text-red-800' },
  high_failure_rate: { label: 'Rată mare de eșec', color: 'bg-red-100 text-red-800' },
  unexpected_company_creation: {
    label: 'Companie creată neașteptat',
    color: 'bg-amber-100 text-amber-800',
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  alert = false,
  small = false,
}: {
  label: string
  value: string | number
  alert?: boolean
  small?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${alert ? 'border-red-200 bg-red-50' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-semibold ${small ? 'text-sm' : 'text-xl'} ${alert ? 'text-red-700' : ''}`}
      >
        {value}
      </div>
    </div>
  )
}

function FilterField({
  label,
  name,
  value,
  placeholder,
  type = 'text',
}: {
  label: string
  name: string
  value?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        className="w-36 rounded border border-input bg-background px-2 py-1 text-xs"
      />
    </div>
  )
}

function PaginationLink({
  params,
  page,
  children,
}: {
  params: Record<string, string | undefined>
  page: number
  children: React.ReactNode
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'errPage') qs.set(k, v)
  }
  qs.set('errPage', String(page))
  return (
    <Link
      href={`/super-admin/system-health?${qs}`}
      className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
    >
      {children}
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    errFrom?: string
    errTo?: string
    errTenant?: string
    errRoute?: string
    errType?: string
    errPage?: string
    auditAction?: string
    auditEntity?: string
    auditUser?: string
    emailTag?: string
    emailTenant?: string
  }>
}

const ERR_PAGE_SIZE = 50

export default async function SystemHealthPage({ searchParams }: PageProps) {
  await requireRole('super_admin')
  const params = await searchParams

  // Error section filters
  const errPage = Math.max(1, parseInt(params.errPage ?? '1', 10))
  const errFromDate = params.errFrom ? new Date(params.errFrom) : undefined
  const errToDate = params.errTo ? new Date(params.errTo) : undefined
  const errWhere = {
    ...(errFromDate || errToDate
      ? {
          createdAt: {
            ...(errFromDate ? { gte: errFromDate } : {}),
            ...(errToDate ? { lte: errToDate } : {}),
          },
        }
      : {}),
    ...(params.errTenant ? { tenantId: params.errTenant } : {}),
    ...(params.errRoute
      ? { route: { contains: params.errRoute, mode: 'insensitive' as const } }
      : {}),
    ...(params.errType
      ? { errorType: { contains: params.errType, mode: 'insensitive' as const } }
      : {}),
  }

  // Audit section filters
  const auditWhere = {
    ...(params.auditAction && (AUDIT_ACTIONS as string[]).includes(params.auditAction)
      ? { action: params.auditAction as AuditAction }
      : {}),
    ...(params.auditEntity ? { entityType: params.auditEntity } : {}),
    ...(params.auditUser ? { userId: params.auditUser } : {}),
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    errorCount24h,
    aiAgg24h,
    emailGroups24h,
    webhookGroups24h,
    cronGroups24h,
    errors,
    errorsTotal,
    cronRuns,
    aiByRoute,
    emailDeliveries,
    auditEntries,
    imports,
    failedWebhooks,
  ] = await Promise.all([
    // Header aggregates (24h)
    prisma.systemErrorLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.aiUsageLog.aggregate({
      where: { occurredAt: { gte: since24h } },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
      _count: { _all: true },
    }),
    prisma.emailDelivery.groupBy({
      by: ['success'],
      where: { attemptedAt: { gte: since24h } },
      _count: { _all: true },
    }),
    prisma.webhookDelivery.groupBy({
      by: ['success'],
      where: { attemptedAt: { gte: since24h } },
      _count: { _all: true },
    }),
    prisma.cronRun.groupBy({
      by: ['status'],
      where: { startedAt: { gte: since24h } },
      _count: { _all: true },
    }),
    // Error section (filtered + paginated)
    prisma.systemErrorLog.findMany({
      where: errWhere,
      orderBy: { createdAt: 'desc' },
      take: ERR_PAGE_SIZE,
      skip: (errPage - 1) * ERR_PAGE_SIZE,
    }),
    prisma.systemErrorLog.count({ where: errWhere }),
    // Cron runs (last 30)
    prisma.cronRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 }),
    // AI usage (last 7d by route+model)
    prisma.aiUsageLog.groupBy({
      by: ['route', 'model'],
      where: { occurredAt: { gte: since7d } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
      orderBy: { _sum: { inputTokens: 'desc' } },
    }),
    // Email delivery (last 24h, filtered)
    prisma.emailDelivery.findMany({
      where: {
        attemptedAt: { gte: since24h },
        ...(params.emailTag ? { tags: { has: params.emailTag } } : {}),
        ...(params.emailTenant ? { tenantId: params.emailTenant } : {}),
      },
      orderBy: { attemptedAt: 'desc' },
      take: 100,
    }),
    // Audit events (last 50, filtered)
    prisma.auditLogEntry.findMany({
      where: auditWhere,
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
    // Imports (last 30)
    prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    // Failed webhooks (last 30)
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

  // Derived header values
  const emailSent24h = emailGroups24h.find((g) => g.success)?._count._all ?? 0
  const emailFailed24h = emailGroups24h.find((g) => !g.success)?._count._all ?? 0
  const webhookSent24h = webhookGroups24h.find((g) => g.success)?._count._all ?? 0
  const webhookFailed24h = webhookGroups24h.find((g) => !g.success)?._count._all ?? 0
  const cronOk24h = cronGroups24h.find((g) => g.status === 'success')?._count._all ?? 0
  const cronFailed24h = cronGroups24h.find((g) => g.status === 'failed')?._count._all ?? 0
  const totalTokens24h = (aiAgg24h._sum.inputTokens ?? 0) + (aiAgg24h._sum.outputTokens ?? 0)
  const estimatedCost24h = aiCost(
    'sonnet',
    aiAgg24h._sum.inputTokens ?? 0,
    aiAgg24h._sum.outputTokens ?? 0,
    aiAgg24h._sum.cacheReadTokens ?? 0
  )

  // Stale cron job detection (latest run per job >25h ago)
  const latestStartPerJob = new Map<string, Date>()
  for (const run of cronRuns) {
    if (!latestStartPerJob.has(run.jobName)) {
      latestStartPerJob.set(run.jobName, run.startedAt)
    }
  }
  const now = new Date()
  const staleJobs = new Set<string>()
  for (const [jobName, lastRun] of latestStartPerJob) {
    if (now.getTime() - lastRun.getTime() > 25 * 60 * 60 * 1000) {
      staleJobs.add(jobName)
    }
  }

  const errTotalPages = Math.ceil(errorsTotal / ERR_PAGE_SIZE)

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Observabilitate platformă — erori, AI, email, cron, audit
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/super-admin">← Super Admin</Link>
        </Button>
      </div>

      {/* ── Aggregate header cards (last 24h) ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Erori 24h" value={errorCount24h} alert={errorCount24h > 0} />
        <StatCard
          label="AI 24h"
          value={`${aiAgg24h._count._all} calls · ${Math.round(totalTokens24h / 1000)}k tok · $${estimatedCost24h.toFixed(3)}`}
          small
        />
        <StatCard
          label="Email 24h"
          value={`${emailSent24h} ok · ${emailFailed24h} fail`}
          alert={emailFailed24h > 0}
          small
        />
        <StatCard
          label="Webhooks 24h"
          value={`${webhookSent24h} ok · ${webhookFailed24h} fail`}
          alert={webhookFailed24h > 0}
          small
        />
        <StatCard
          label="Cron 24h"
          value={`${cronOk24h} ok · ${cronFailed24h} fail`}
          alert={cronFailed24h > 0}
          small
        />
      </div>

      {/* ── Section 1: Errors ──────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Erori recente{' '}
            <span className="text-sm font-normal text-muted-foreground">({errorsTotal} total)</span>
          </h2>
          <CsvExportButton
            filename="errors.csv"
            headers={['Timestamp', 'Tenant', 'Route', 'Method', 'Type', 'Message']}
            rows={errors.map((e) => [
              ts(e.createdAt),
              e.tenantId ?? '',
              e.route,
              e.method,
              e.errorType,
              e.message.slice(0, 300),
            ])}
          />
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2 text-sm">
          <FilterField label="De la" name="errFrom" type="date" value={params.errFrom} />
          <FilterField label="Până la" name="errTo" type="date" value={params.errTo} />
          <FilterField
            label="Tenant ID"
            name="errTenant"
            value={params.errTenant}
            placeholder="uuid…"
          />
          <FilterField label="Route" name="errRoute" value={params.errRoute} placeholder="/api/…" />
          <FilterField
            label="Tip eroare"
            name="errType"
            value={params.errType}
            placeholder="TypeError…"
          />
          <input type="hidden" name="errPage" value="1" />
          <button
            type="submit"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Filtrează
          </button>
          <Link
            href="/super-admin/system-health"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Reset
          </Link>
        </form>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio eroare înregistrată.</p>
        ) : (
          <>
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
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {ts(e.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.tenantId ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{e.route}</TableCell>
                    <TableCell className="text-xs">{e.method}</TableCell>
                    <TableCell className="text-xs">{e.errorType}</TableCell>
                    <TableCell className="max-w-xs text-xs">
                      <details>
                        <summary className="max-w-xs cursor-pointer truncate">
                          {e.message.slice(0, 150)}
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                          {e.stackTrace ?? '(no stack)'}
                          {e.context ? `\n\nContext: ${JSON.stringify(e.context, null, 2)}` : ''}
                        </pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {errTotalPages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Pagina {errPage} din {errTotalPages}
                </span>
                {errPage > 1 && (
                  <PaginationLink params={params} page={errPage - 1}>
                    ← Anterior
                  </PaginationLink>
                )}
                {errPage < errTotalPages && (
                  <PaginationLink params={params} page={errPage + 1}>
                    Următor →
                  </PaginationLink>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Section 2: Cron runs ───────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Cron runs{' '}
            <span className="text-sm font-normal text-muted-foreground">(ultimele 30)</span>
            {staleJobs.size > 0 && (
              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                {staleJobs.size} job{staleJobs.size > 1 ? 's' : ''} stale (&gt;25h)
              </span>
            )}
          </h2>
          <CsvExportButton
            filename="cron-runs.csv"
            headers={['Start', 'Job', 'Status', 'Duration (s)', 'Items', 'Errors', 'Error message']}
            rows={cronRuns.map((r) => [
              ts(r.startedAt),
              r.jobName,
              r.status,
              r.finishedAt
                ? ((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)
                : '',
              r.itemsProcessed,
              r.errorCount,
              r.errorMessage ?? '',
            ])}
          />
        </div>
        {cronRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio execuție cron înregistrată.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Start (UTC)</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Durată</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Erori</TableHead>
                <TableHead>Mesaj eroare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cronRuns.map((r) => {
                const durationMs = r.finishedAt
                  ? r.finishedAt.getTime() - r.startedAt.getTime()
                  : null
                const isLatestStale =
                  latestStartPerJob.get(r.jobName) === r.startedAt && staleJobs.has(r.jobName)
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {ts(r.startedAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.jobName}
                      {isLatestStale && (
                        <span className="ml-2 rounded bg-red-100 px-1 py-0.5 text-xs text-red-700">
                          stale
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          r.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : r.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.itemsProcessed}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.errorCount > 0 ? (
                        <span className="text-red-600">{r.errorCount}</span>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs">
                      {r.errorMessage ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ── Section 3: AI usage ────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            AI usage{' '}
            <span className="text-sm font-normal text-muted-foreground">
              (ultimele 7 zile, grupat pe rută)
            </span>
          </h2>
          <CsvExportButton
            filename="ai-usage.csv"
            headers={[
              'Route',
              'Model',
              'Calls',
              'Input tokens',
              'Output tokens',
              'Cache read',
              'Est. cost ($)',
            ]}
            rows={aiByRoute.map((r) => [
              r.route,
              r.model,
              r._count._all,
              r._sum.inputTokens ?? 0,
              r._sum.outputTokens ?? 0,
              r._sum.cacheReadTokens ?? 0,
              aiCost(
                r.model,
                r._sum.inputTokens ?? 0,
                r._sum.outputTokens ?? 0,
                r._sum.cacheReadTokens ?? 0
              ).toFixed(4),
            ])}
          />
        </div>
        {aiByRoute.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio utilizare AI înregistrată.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rută</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input tok</TableHead>
                <TableHead className="text-right">Output tok</TableHead>
                <TableHead className="text-right">Cache read</TableHead>
                <TableHead className="text-right">Cost est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiByRoute.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable server-rendered list
                <TableRow key={`${r.route}-${r.model}-${i}`}>
                  <TableCell className="font-mono text-xs">{r.route}</TableCell>
                  <TableCell className="text-xs">{r.model}</TableCell>
                  <TableCell className="text-right text-xs">{r._count._all}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(r._sum.inputTokens ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(r._sum.outputTokens ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(r._sum.cacheReadTokens ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    $
                    {aiCost(
                      r.model,
                      r._sum.inputTokens ?? 0,
                      r._sum.outputTokens ?? 0,
                      r._sum.cacheReadTokens ?? 0
                    ).toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ── Section 4: Email delivery ──────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Email delivery{' '}
            <span className="text-sm font-normal text-muted-foreground">(ultimele 24h)</span>
          </h2>
          <CsvExportButton
            filename="email-delivery.csv"
            headers={[
              'Timestamp',
              'Tenant',
              'To',
              'Subject',
              'Tags',
              'Success',
              'Message ID',
              'Error',
            ]}
            rows={emailDeliveries.map((e) => [
              ts(e.attemptedAt),
              e.tenantId ?? '',
              e.toEmail,
              e.subject,
              e.tags.join(';'),
              e.success,
              e.messageId ?? '',
              e.errorMessage ?? '',
            ])}
          />
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2 text-sm">
          <FilterField
            label="Tag"
            name="emailTag"
            value={params.emailTag}
            placeholder="trial-day7…"
          />
          <FilterField
            label="Tenant ID"
            name="emailTenant"
            value={params.emailTenant}
            placeholder="uuid…"
          />
          <button
            type="submit"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Filtrează
          </button>
          <Link
            href="/super-admin/system-health"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Reset
          </Link>
        </form>
        {emailDeliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Niciun email înregistrat.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Eroare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailDeliveries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {ts(e.attemptedAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.tenantId ?? '—'}</TableCell>
                  <TableCell className="text-xs">{e.toEmail}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{e.subject}</TableCell>
                  <TableCell className="text-xs">{e.tags.join(', ')}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        e.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {e.success ? 'ok' : 'fail'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.errorMessage ? (
                      <details>
                        <summary className="cursor-pointer text-red-600">eroare</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-1 text-xs">
                          {e.errorMessage}
                        </pre>
                      </details>
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

      {/* ── Section 5: Audit events ────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Audit events{' '}
            <span className="text-sm font-normal text-muted-foreground">(ultimele 50)</span>
          </h2>
          <CsvExportButton
            filename="audit-events.csv"
            headers={[
              'Timestamp',
              'Tenant',
              'User',
              'Action',
              'Entity type',
              'Entity ID',
              'Summary',
              'IP',
              'Session',
            ]}
            rows={auditEntries.map((e) => [
              ts(e.occurredAt),
              e.tenantId ?? '',
              e.userId ?? '',
              e.action,
              e.entityType,
              e.entityId ?? '',
              e.entitySummary ?? '',
              e.ipAddress ?? '',
              e.sessionId ?? '',
            ])}
          />
        </div>
        <form method="GET" className="flex flex-wrap items-end gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <label htmlFor="auditAction" className="text-xs text-muted-foreground">
              Acțiune
            </label>
            <select
              id="auditAction"
              name="auditAction"
              defaultValue={params.auditAction ?? ''}
              className="rounded border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="">Toate</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <FilterField
            label="Entity type"
            name="auditEntity"
            value={params.auditEntity}
            placeholder="employee…"
          />
          <FilterField
            label="User ID"
            name="auditUser"
            value={params.auditUser}
            placeholder="uuid…"
          />
          <button
            type="submit"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Filtrează
          </button>
          <Link
            href="/super-admin/system-health"
            className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
          >
            Reset
          </Link>
        </form>
        {auditEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Niciun eveniment audit înregistrat.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Acțiune</TableHead>
                <TableHead>Entity type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditEntries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {ts(e.occurredAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.tenantId ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{e.userId ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${auditActionColor(e.action)}`}>
                      {e.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{e.entityType}</TableCell>
                  <TableCell className="text-xs">
                    {e.entitySummary ? (
                      <span title={e.entityId ?? undefined}>{e.entitySummary}</span>
                    ) : (
                      <span className="font-mono">{e.entityId?.slice(0, 8) ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.ipAddress ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* ── Section 6: Imports ─────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Importuri recente{' '}
            <span className="text-sm font-normal text-muted-foreground">(ultimele 30)</span>
          </h2>
          <CsvExportButton
            filename="imports.csv"
            headers={[
              'Timestamp',
              'Tenant',
              'Total',
              'Creat',
              'Sărit',
              'Eșuat',
              'Companii noi',
              'Locuri noi',
            ]}
            rows={imports.map((j) => [
              ts(j.createdAt),
              j.tenantId,
              j.totalRows,
              j.created,
              j.skipped,
              j.failed,
              j.companiesCreated,
              j.workplacesCreated,
            ])}
          />
        </div>
        {imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Niciun import înregistrat.</p>
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
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {ts(job.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{job.tenantId}</TableCell>
                    <TableCell className="text-right text-xs">{job.totalRows}</TableCell>
                    <TableCell className="text-right text-xs text-green-700">
                      {job.created}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {job.skipped}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-600">{job.failed}</TableCell>
                    <TableCell className="text-right text-xs">{job.companiesCreated}</TableCell>
                    <TableCell className="text-right text-xs">{job.workplacesCreated}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => {
                          const meta = FLAG_LABELS[f]
                          return (
                            <span
                              key={f}
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${meta?.color ?? 'bg-gray-100 text-gray-700'}`}
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

      {/* ── Section 7: Failed webhooks ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Webhook-uri eșuate{' '}
            <span className="text-sm font-normal text-muted-foreground">(ultimele 30)</span>
          </h2>
          <CsvExportButton
            filename="failed-webhooks.csv"
            headers={['Timestamp', 'Tenant', 'Event', 'URL', 'Status']}
            rows={failedWebhooks.map((d) => [
              ts(d.attemptedAt),
              d.endpoint.tenantId,
              d.event,
              d.endpoint.url,
              d.responseStatus ?? 'error',
            ])}
          />
        </div>
        {failedWebhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Niciun webhook eșuat înregistrat.</p>
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
              {failedWebhooks.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {ts(d.attemptedAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.endpoint.tenantId}</TableCell>
                  <TableCell className="text-xs">{d.event}</TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs">
                    {d.endpoint.url.slice(0, 60)}
                    {d.endpoint.url.length > 60 ? '…' : ''}
                  </TableCell>
                  <TableCell className="text-xs">{d.responseStatus ?? 'error'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

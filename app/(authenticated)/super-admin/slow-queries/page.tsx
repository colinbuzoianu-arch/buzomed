import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
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
 * Super-admin diagnostic dashboard for slow_query_logs (see
 * lib/slow-query-log.ts). Purely a read-only inspection tool — no charts,
 * no export, no alerting. Two views:
 *   - Aggregated (default): grouped by query template, p50/p95/max/count.
 *   - Raw: individual log rows, paginated, for spot-checking a spike.
 */

const SLOW_QUERIES_PATH = '/super-admin/slow-queries'
const RAW_PAGE_SIZE = 50
const AGG_LIMIT = 100

const RANGE_TO_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}
type RangeKey = keyof typeof RANGE_TO_MS
const VALID_RANGES: RangeKey[] = ['24h', '7d', '30d']

type SortKey = 'p95' | 'count' | 'max' | 'last'
const VALID_SORTS: SortKey[] = ['p95', 'count', 'max', 'last']
const SORT_COLUMN: Record<SortKey, string> = {
  p95: 'p95Ms',
  count: 'occurrenceCount',
  max: 'maxMs',
  last: 'lastOccurredAt',
}

interface AggRow {
  queryText: string
  model: string | null
  operation: string | null
  occurrenceCount: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  lastOccurredAt: Date
}

function ts(d: Date | string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{children}</span>
  )
}

function SortLink({
  sortKey,
  label,
  currentSort,
  queryString,
}: {
  sortKey: SortKey
  label: string
  currentSort: SortKey
  queryString: URLSearchParams
}) {
  const isActive = currentSort === sortKey
  const qs = new URLSearchParams(queryString)
  qs.set('sort', sortKey)
  return (
    <Link
      href={`${SLOW_QUERIES_PATH}?${qs}`}
      className={`flex items-center gap-1 hover:text-foreground ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
    >
      {label}
      {isActive && <span className="text-xs">↓</span>}
    </Link>
  )
}

interface PageProps {
  searchParams: Promise<{
    range?: string
    model?: string
    minMs?: string
    sort?: string
    tab?: string
    rawPage?: string
  }>
}

export default async function SlowQueriesPage({ searchParams }: PageProps) {
  await requireRole('super_admin')
  const params = await searchParams

  const range: RangeKey = VALID_RANGES.includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : '7d'
  const sinceDate = new Date(Date.now() - RANGE_TO_MS[range])
  const modelFilter = params.model?.trim() || undefined
  const minMs = params.minMs ? Number(params.minMs) : undefined
  const hasMinMs = minMs !== undefined && Number.isFinite(minMs)
  const sort: SortKey = VALID_SORTS.includes(params.sort as SortKey)
    ? (params.sort as SortKey)
    : 'p95'
  const tab = params.tab === 'raw' ? 'raw' : 'agg'
  const rawPage = Math.max(1, Number.parseInt(params.rawPage ?? '1', 10) || 1)

  const since7d = new Date(Date.now() - RANGE_TO_MS['7d'])

  const conditions = [Prisma.sql`occurred_at >= ${sinceDate}`]
  if (modelFilter) conditions.push(Prisma.sql`model = ${modelFilter}`)
  if (hasMinMs) conditions.push(Prisma.sql`duration_ms >= ${minMs}`)
  const whereFragment = Prisma.join(conditions, ' AND ')
  const sortColumnIdent = Prisma.raw(`"${SORT_COLUMN[sort]}"`)

  const rawWhere: Prisma.SlowQueryLogWhereInput = {
    occurredAt: { gte: sinceDate },
    ...(modelFilter ? { model: modelFilter } : {}),
    ...(hasMinMs ? { durationMs: { gte: minMs } } : {}),
  }

  const [
    aggregated,
    totalLogged7d,
    medianRows,
    slowTemplates7d,
    distinctModels,
    rawLogs,
    rawTotal,
  ] = await Promise.all([
    prisma.$queryRaw<AggRow[]>(Prisma.sql`
        SELECT
          query_text AS "queryText",
          MAX(model) AS model,
          MAX(operation) AS operation,
          COUNT(*)::int AS "occurrenceCount",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS "p50Ms",
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS "p95Ms",
          MAX(duration_ms) AS "maxMs",
          MAX(occurred_at) AS "lastOccurredAt"
        FROM slow_query_logs
        WHERE ${whereFragment}
        GROUP BY query_text
        ORDER BY ${sortColumnIdent} DESC
        LIMIT ${AGG_LIMIT}
      `),
    prisma.slowQueryLog.count({ where: { occurredAt: { gte: since7d } } }),
    prisma.$queryRaw<{ median: number | null }[]>(Prisma.sql`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS median
        FROM slow_query_logs
        WHERE occurred_at >= ${since7d}
      `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT query_text
          FROM slow_query_logs
          WHERE occurred_at >= ${since7d}
          GROUP BY query_text
          HAVING PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) > 500
        ) sub
      `),
    prisma.slowQueryLog.findMany({
      where: { model: { not: null } },
      distinct: ['model'],
      select: { model: true },
      orderBy: { model: 'asc' },
    }),
    tab === 'raw'
      ? prisma.slowQueryLog.findMany({
          where: rawWhere,
          orderBy: { occurredAt: 'desc' },
          take: RAW_PAGE_SIZE,
          skip: (rawPage - 1) * RAW_PAGE_SIZE,
        })
      : Promise.resolve([]),
    tab === 'raw' ? prisma.slowQueryLog.count({ where: rawWhere }) : Promise.resolve(0),
  ])

  const medianDuration7d = medianRows[0]?.median ?? 0
  const slowestTemplateCount7d = slowTemplates7d[0]?.count ?? 0
  const rawTotalPages = Math.ceil(rawTotal / RAW_PAGE_SIZE)

  // Preserve active filters across sort/tab/pagination links, minus the
  // param each link owns itself.
  const filterQs = new URLSearchParams()
  if (params.range) filterQs.set('range', params.range)
  if (params.model) filterQs.set('model', params.model)
  if (params.minMs) filterQs.set('minMs', params.minMs)
  if (params.sort) filterQs.set('sort', params.sort)

  const aggTabQs = new URLSearchParams(filterQs)
  aggTabQs.delete('tab')
  const rawTabQs = new URLSearchParams(filterQs)
  rawTabQs.set('tab', 'raw')

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interogări lente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Diagnostic Prisma — interogări mai lente decât pragul configurat
            (SLOW_QUERY_THRESHOLD_MS)
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/super-admin">← Super Admin</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Interogări lente (7 zile, p95 > 500ms)" value={slowestTemplateCount7d} />
        <StatCard label="Total înregistrat (7 zile)" value={totalLogged7d} />
        <StatCard label="Durată mediană (7 zile)" value={`${medianDuration7d} ms`} />
      </div>

      <div className="flex gap-2 border-b text-sm">
        <Link
          href={`${SLOW_QUERIES_PATH}?${aggTabQs}`}
          className={`px-3 py-2 ${tab === 'agg' ? 'border-b-2 border-primary font-semibold' : 'text-muted-foreground'}`}
        >
          Agregat
        </Link>
        <Link
          href={`${SLOW_QUERIES_PATH}?${rawTabQs}`}
          className={`px-3 py-2 ${tab === 'raw' ? 'border-b-2 border-primary font-semibold' : 'text-muted-foreground'}`}
        >
          Jurnal brut
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="tab" value={tab} />
        <div className="flex flex-col gap-1">
          <label htmlFor="range" className="text-xs text-muted-foreground">
            Interval
          </label>
          <select
            id="range"
            name="range"
            defaultValue={range}
            className="rounded border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="24h">24h</option>
            <option value="7d">7 zile</option>
            <option value="30d">30 zile</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="model" className="text-xs text-muted-foreground">
            Model
          </label>
          <select
            id="model"
            name="model"
            defaultValue={modelFilter ?? ''}
            className="w-40 rounded border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">Toate</option>
            {distinctModels.map((m) => (
              <option key={m.model} value={m.model ?? ''}>
                {m.model}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="minMs" className="text-xs text-muted-foreground">
            Durată minimă (ms)
          </label>
          <input
            id="minMs"
            type="number"
            name="minMs"
            defaultValue={params.minMs ?? ''}
            placeholder="200"
            className="w-24 rounded border border-input bg-background px-2 py-1 text-xs"
          />
        </div>
        <button
          type="submit"
          className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
        >
          Filtrează
        </button>
        <Link
          href={`${SLOW_QUERIES_PATH}${tab === 'raw' ? '?tab=raw' : ''}`}
          className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
        >
          Reset
        </Link>
      </form>

      {tab === 'agg' ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">
            Grupat pe interogare{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({aggregated.length}
              {aggregated.length === AGG_LIMIT ? '+' : ''})
            </span>
          </h2>
          {aggregated.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nicio interogare lentă înregistrată în intervalul selectat.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interogare</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Operație</TableHead>
                  <TableHead className="text-right">
                    <SortLink
                      sortKey="count"
                      label="Nr."
                      currentSort={sort}
                      queryString={filterQs}
                    />
                  </TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">
                    <SortLink sortKey="p95" label="p95" currentSort={sort} queryString={filterQs} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortLink sortKey="max" label="Max" currentSort={sort} queryString={filterQs} />
                  </TableHead>
                  <TableHead>
                    <SortLink
                      sortKey="last"
                      label="Ultima apariție"
                      currentSort={sort}
                      queryString={filterQs}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable server-rendered list, queryText can repeat visually but not as a group key here
                  <TableRow key={`${row.queryText}-${i}`}>
                    <TableCell className="max-w-md font-mono text-xs">
                      <details>
                        <summary className="cursor-pointer truncate">
                          {row.queryText.slice(0, 100)}
                          {row.queryText.length > 100 ? '…' : ''}
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                          {row.queryText}
                        </pre>
                      </details>
                    </TableCell>
                    <TableCell>{row.model ? <Badge>{row.model}</Badge> : '—'}</TableCell>
                    <TableCell>{row.operation ? <Badge>{row.operation}</Badge> : '—'}</TableCell>
                    <TableCell className="text-right text-xs">{row.occurrenceCount}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.p50Ms} ms</TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.p95Ms} ms</TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.maxMs} ms</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {ts(row.lastOccurredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">
            Jurnal brut{' '}
            <span className="text-sm font-normal text-muted-foreground">({rawTotal} total)</span>
          </h2>
          {rawLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nicio înregistrare în intervalul selectat.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Timestamp (UTC)</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Operație</TableHead>
                    <TableHead className="text-right">Durată</TableHead>
                    <TableHead>Interogare</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {ts(log.occurredAt)}
                      </TableCell>
                      <TableCell>{log.model ? <Badge>{log.model}</Badge> : '—'}</TableCell>
                      <TableCell>{log.operation ? <Badge>{log.operation}</Badge> : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {log.durationMs} ms
                      </TableCell>
                      <TableCell className="max-w-md font-mono text-xs">
                        <details>
                          <summary className="cursor-pointer truncate">
                            {log.queryText.slice(0, 100)}
                            {log.queryText.length > 100 ? '…' : ''}
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                            {log.queryText}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                href={SLOW_QUERIES_PATH}
                params={{ ...params, tab: 'raw' }}
                paramName="rawPage"
                page={rawPage}
                totalPages={rawTotalPages}
              />
            </>
          )}
        </section>
      )}
    </div>
  )
}

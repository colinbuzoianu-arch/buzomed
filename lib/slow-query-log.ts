import { PrismaClient } from '@prisma/client'

// Pure redaction/extraction helpers, plus the persistence path for slow
// query entries. Kept separate from lib/prisma.ts so the singleton client
// wiring stays readable and these functions stay independently testable.
//
// PRIVACY: redactQuery MUST run before anything reaches the database.
// slow_query_logs is not tenant-scoped and is readable by every
// super_admin — literal CNPs, emails, phones, and UUIDs must never survive
// into queryText.

const SLOW_QUERY_LOG_RETENTION_DAYS = 30

declare global {
  // eslint-disable-next-line no-var
  var slowQueryLogClient: PrismaClient | undefined
}

// Separate, silently-configured client (log: []) used only to persist slow
// query entries. Using the instrumented `prisma` client here would log its
// own INSERT as a query, which — if slow — logs another INSERT, forever.
function getLoggerClient(): PrismaClient {
  const client = globalThis.slowQueryLogClient ?? new PrismaClient({ log: [] })
  if (process.env.NODE_ENV !== 'production') globalThis.slowQueryLogClient = client
  return client
}

export async function persistSlowQuery(entry: {
  queryText: string
  durationMs: number
  model: string | null
  operation: string | null
}): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SLOW_QUERY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    await getLoggerClient().slowQueryLog.create({
      data: {
        queryText: entry.queryText,
        durationMs: entry.durationMs,
        model: entry.model,
        operation: entry.operation,
        routePath: null,
        occurredAt: now,
        expiresAt,
      },
    })
  } catch (err) {
    // Never let logging failures surface anywhere near the app hot path.
    console.error('[slow-query-log] Failed to persist:', err)
  }
}

/** Strips literal parameter values from a query string, keeping the shape. */
export function redactQuery(query: string): string {
  return query
    .replace(/'\d{13}'/g, "'<CNP>'") // Romanian CNP (13 digits)
    .replace(/'[^']*@[^']*'/g, "'<EMAIL>'")
    .replace(/'\+?\d[\d\s\-()]{6,}\d'/g, "'<PHONE>'")
    .replace(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi, "'<UUID>'")
    .replace(/= \$\d+/g, '= <param>')
    .slice(0, 2000)
}

/** Best-effort table name extraction from a `FROM "public"."table"` clause. */
export function extractModel(query: string): string | null {
  const match = query.match(/FROM\s+"?(?:public"?\.)?"?([a-z_]+)"?/i)
  return match ? match[1] : null
}

export function extractOperation(query: string): string | null {
  const q = query.trim().toUpperCase()
  if (q.startsWith('SELECT')) return 'select'
  if (q.startsWith('INSERT')) return 'insert'
  if (q.startsWith('UPDATE')) return 'update'
  if (q.startsWith('DELETE')) return 'delete'
  return null
}

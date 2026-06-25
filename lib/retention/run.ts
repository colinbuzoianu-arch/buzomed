import { prisma } from '@/lib/prisma'
import { RETENTION_POLICY } from './config'

export interface StreamResult {
  stream: string
  deleted: number
  skipped: number
  error?: string
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// ─── Audit log ────────────────────────────────────────────────────────────────
// Complex carve-outs require raw SQL. The WHERE clause is built as a constant
// string (no user input); only the cutoff dates are parameterized ($1–$4).
async function pruneAuditLog(dryRun: boolean): Promise<StreamResult> {
  const cfg = RETENTION_POLICY.auditLog
  const defaultCutoff = cutoff(cfg.defaultDays)
  const cnpCutoff = cutoff(cfg.carveOuts.cnpDecryptDays)
  const examCutoff = cutoff(cfg.carveOuts.examinationLifecycleDays)
  const invoiceCutoff = cutoff(cfg.carveOuts.platformInvoiceDays)

  // Rows to delete = (any of the cutoff conditions) AND NOT covered by a carve-out.
  // Tenant-lifecycle entries (entity_type='tenant', action IN ('update','delete') by a user)
  // are excluded from all branches — they are kept forever.
  const whereClause = `
    (
      occurred_at < $1
      AND NOT (changes->>'cnpDecrypted' = 'true')
      AND NOT (entity_type = 'examination' AND action IN ('sign', 'delete', 'export'))
      AND NOT (entity_type = 'platform_invoice')
      AND NOT (entity_type = 'tenant' AND action IN ('update', 'delete') AND user_id IS NOT NULL)
    )
    OR (
      changes->>'cnpDecrypted' = 'true' AND occurred_at < $2
    )
    OR (
      entity_type = 'examination' AND action IN ('sign', 'delete', 'export')
      AND occurred_at < $3
    )
    OR (
      entity_type = 'platform_invoice' AND occurred_at < $4
    )
  `

  if (dryRun) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM audit_log_entries WHERE ${whereClause}`,
      defaultCutoff,
      cnpCutoff,
      examCutoff,
      invoiceCutoff
    )
    return { stream: 'auditLog', deleted: Number(rows[0]?.count ?? 0), skipped: 0 }
  }

  // Batched delete (5 000 rows per iteration) to avoid long table locks.
  // Safety cap of 100 batches = max 500 000 rows per run.
  let total = 0
  for (let i = 0; i < 100; i++) {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM audit_log_entries WHERE id IN (
         SELECT id FROM audit_log_entries WHERE ${whereClause} LIMIT 5000
       )`,
      defaultCutoff,
      cnpCutoff,
      examCutoff,
      invoiceCutoff
    )
    total += deleted
    if (deleted < 5000) break
  }
  return { stream: 'auditLog', deleted: total, skipped: 0 }
}

// ─── AI usage log ─────────────────────────────────────────────────────────────
// Aggregate to monthly summaries before deleting raw rows. The INSERT … ON CONFLICT
// is idempotent — safe to re-run if the cron fires twice.
async function pruneAiUsageLog(dryRun: boolean): Promise<StreamResult> {
  const cutoffDate = cutoff(RETENTION_POLICY.aiUsageLog.defaultDays)

  if (dryRun) {
    const c = await prisma.aiUsageLog.count({ where: { occurredAt: { lt: cutoffDate } } })
    return { stream: 'aiUsageLog', deleted: c, skipped: 0 }
  }

  // 1. Aggregate to monthly summaries (idempotent upsert via ON CONFLICT DO UPDATE).
  //    The unique constraint on ai_usage_monthly_summaries uses NULLS NOT DISTINCT
  //    so NULL tenant_id is treated as equal for conflict detection.
  await prisma.$executeRaw`
    INSERT INTO ai_usage_monthly_summaries (
      id, tenant_id, route, model, year_month,
      call_count, success_count,
      total_input_tokens, total_output_tokens, total_cache_read_tokens,
      total_duration_ms
    )
    SELECT
      gen_random_uuid()::text,
      tenant_id, route, model,
      to_char(occurred_at, 'YYYY-MM'),
      COUNT(*)::integer,
      COUNT(*) FILTER (WHERE success = true)::integer,
      COALESCE(SUM(input_tokens), 0)::bigint,
      COALESCE(SUM(output_tokens), 0)::bigint,
      COALESCE(SUM(cache_read_tokens), 0)::bigint,
      COALESCE(SUM(duration_ms), 0)::bigint
    FROM ai_usage_logs
    WHERE occurred_at < ${cutoffDate}
    GROUP BY tenant_id, route, model, to_char(occurred_at, 'YYYY-MM')
    ON CONFLICT (tenant_id, route, model, year_month) DO UPDATE SET
      call_count            = ai_usage_monthly_summaries.call_count            + EXCLUDED.call_count,
      success_count         = ai_usage_monthly_summaries.success_count         + EXCLUDED.success_count,
      total_input_tokens    = ai_usage_monthly_summaries.total_input_tokens    + EXCLUDED.total_input_tokens,
      total_output_tokens   = ai_usage_monthly_summaries.total_output_tokens   + EXCLUDED.total_output_tokens,
      total_cache_read_tokens = ai_usage_monthly_summaries.total_cache_read_tokens + EXCLUDED.total_cache_read_tokens,
      total_duration_ms     = ai_usage_monthly_summaries.total_duration_ms     + EXCLUDED.total_duration_ms
  `

  // 2. Safe to delete the raw rows now that summaries are written.
  const result = await prisma.aiUsageLog.deleteMany({ where: { occurredAt: { lt: cutoffDate } } })
  return { stream: 'aiUsageLog', deleted: result.count, skipped: 0 }
}

// ─── Webhook delivery ─────────────────────────────────────────────────────────
async function pruneWebhookDelivery(dryRun: boolean): Promise<StreamResult> {
  const cfg = RETENTION_POLICY.webhookDelivery
  const successCutoff = cutoff(cfg.defaultDays)
  const failCutoff = cutoff(cfg.carveOuts.failedDays)
  const where = {
    OR: [
      { success: true, attemptedAt: { lt: successCutoff } },
      { success: false, attemptedAt: { lt: failCutoff } },
    ],
  }
  if (dryRun) {
    const c = await prisma.webhookDelivery.count({ where })
    return { stream: 'webhookDelivery', deleted: c, skipped: 0 }
  }
  const result = await prisma.webhookDelivery.deleteMany({ where })
  return { stream: 'webhookDelivery', deleted: result.count, skipped: 0 }
}

// ─── Cron run ─────────────────────────────────────────────────────────────────
async function pruneCronRun(dryRun: boolean): Promise<StreamResult> {
  const cfg = RETENTION_POLICY.cronRun
  const successCutoff = cutoff(cfg.defaultDays)
  const failCutoff = cutoff(cfg.carveOuts.failedDays)
  const where = {
    OR: [
      { status: { not: 'failed' }, startedAt: { lt: successCutoff } },
      { status: 'failed', startedAt: { lt: failCutoff } },
    ],
  }
  if (dryRun) {
    const c = await prisma.cronRun.count({ where })
    return { stream: 'cronRun', deleted: c, skipped: 0 }
  }
  const result = await prisma.cronRun.deleteMany({ where })
  return { stream: 'cronRun', deleted: result.count, skipped: 0 }
}

// ─── Email delivery ───────────────────────────────────────────────────────────
async function pruneEmailDelivery(dryRun: boolean): Promise<StreamResult> {
  const cfg = RETENTION_POLICY.emailDelivery
  const successCutoff = cutoff(cfg.defaultDays)
  const failCutoff = cutoff(cfg.carveOuts.failedDays)
  const where = {
    OR: [
      { success: true, attemptedAt: { lt: successCutoff } },
      { success: false, attemptedAt: { lt: failCutoff } },
    ],
  }
  if (dryRun) {
    const c = await prisma.emailDelivery.count({ where })
    return { stream: 'emailDelivery', deleted: c, skipped: 0 }
  }
  const result = await prisma.emailDelivery.deleteMany({ where })
  return { stream: 'emailDelivery', deleted: result.count, skipped: 0 }
}

// ─── Simple streams (single cutoff, no carve-outs) ───────────────────────────
async function pruneSimple(
  stream: string,
  deleteFn: (cutoffDate: Date) => Promise<number>,
  countFn: (cutoffDate: Date) => Promise<number>,
  days: number,
  dryRun: boolean
): Promise<StreamResult> {
  const cutoffDate = cutoff(days)
  const count = dryRun ? await countFn(cutoffDate) : await deleteFn(cutoffDate)
  return { stream, deleted: count, skipped: 0 }
}

// ─── Top-level runner ─────────────────────────────────────────────────────────
export async function runRetention(dryRun: boolean): Promise<StreamResult[]> {
  const results: StreamResult[] = []

  const streamTasks: Array<[string, () => Promise<StreamResult>]> = [
    ['auditLog', () => pruneAuditLog(dryRun)],
    [
      'systemErrorLog',
      () =>
        pruneSimple(
          'systemErrorLog',
          async (c) =>
            (await prisma.systemErrorLog.deleteMany({ where: { createdAt: { lt: c } } })).count,
          (c) => prisma.systemErrorLog.count({ where: { createdAt: { lt: c } } }),
          RETENTION_POLICY.systemErrorLog.defaultDays,
          dryRun
        ),
    ],
    [
      'importJob',
      () =>
        pruneSimple(
          'importJob',
          async (c) =>
            (await prisma.importJob.deleteMany({ where: { createdAt: { lt: c } } })).count,
          (c) => prisma.importJob.count({ where: { createdAt: { lt: c } } }),
          RETENTION_POLICY.importJob.defaultDays,
          dryRun
        ),
    ],
    ['webhookDelivery', () => pruneWebhookDelivery(dryRun)],
    ['aiUsageLog', () => pruneAiUsageLog(dryRun)],
    ['cronRun', () => pruneCronRun(dryRun)],
    ['emailDelivery', () => pruneEmailDelivery(dryRun)],
    [
      'processedStripeEvent',
      () =>
        pruneSimple(
          'processedStripeEvent',
          async (c) =>
            (await prisma.processedStripeEvent.deleteMany({ where: { processedAt: { lt: c } } }))
              .count,
          (c) => prisma.processedStripeEvent.count({ where: { processedAt: { lt: c } } }),
          RETENTION_POLICY.processedStripeEvent.defaultDays,
          dryRun
        ),
    ],
  ]

  for (const [streamName, run] of streamTasks) {
    try {
      results.push(await run())
    } catch (err) {
      results.push({
        stream: streamName,
        deleted: 0,
        skipped: 0,
        error: (err as Error).message,
      })
    }
  }

  return results
}

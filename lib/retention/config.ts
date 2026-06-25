// Retention policy for log/audit streams.
//
// CRITICAL: Before changing any value here, verify against Romanian legal context:
//   - HG 355/2007: occupational medicine record retention (50y)
//   - Codul Fiscal: accounting record retention (10y)
//   - Legea 190/2018 (GDPR): proportionality — keep no longer than necessary
//   - Legea 362/2018: cybersecurity logs ~2y common practice
// When in doubt, consult counsel. Anything related to medical records or invoicing
// should err toward longer retention; routine operational logs should err shorter.
//
// Values are in days. Use Number.POSITIVE_INFINITY for "keep forever".

export const RETENTION_POLICY = {
  auditLog: {
    // Default for routine audit entries (employee reads, company updates, etc.)
    defaultDays: 730, // 2 years

    // Carve-outs — entries matching these stay longer.
    carveOuts: {
      // Sensitive PII access — needed for delayed-detection breach investigation
      cnpDecryptDays: 2555, // 7 years

      // Medical record metadata — conservative: align with the examination record itself
      // Actions: sign, export, delete on entityType='examination'
      examinationLifecycleDays: 3650, // 10 years (NOT 50 — that's for the record itself)

      // Accounting trail — Codul Fiscal Romania
      platformInvoiceDays: 3650, // 10 years

      // Super-admin accountability — tiny volume, keep forever
      tenantLifecycleForever: true, // suspend, reactivate, delete on tenant

      // Auth events (login/logout) — NIS2 common practice
      authEventDays: 730, // 2 years (same as default but explicit)
    },
  },
  systemErrorLog: { defaultDays: 180 },
  importJob: { defaultDays: 730 },
  webhookDelivery: {
    defaultDays: 90,
    carveOuts: { failedDays: 365 },
  },
  aiUsageLog: {
    defaultDays: 180,
    // Aggregate to ai_usage_monthly_summaries before deletion. Aggregates kept forever
    // (they're tiny — one row per tenant per route per month).
    aggregateBeforeDelete: true,
  },
  cronRun: {
    defaultDays: 365,
    carveOuts: { failedDays: 730 },
  },
  emailDelivery: {
    defaultDays: 180,
    carveOuts: { failedDays: 365 },
  },
  processedStripeEvent: { defaultDays: 60 }, // Stripe retry window is much shorter; 60d is bulletproof
} as const

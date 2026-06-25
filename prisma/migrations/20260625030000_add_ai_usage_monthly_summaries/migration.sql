-- Compressed monthly aggregate of ai_usage_logs.
-- Raw rows are deleted after the retention window; this table keeps forever.
-- BigInt columns because per-tenant monthly token sums can exceed INT4 range.
--
-- NOTE: The unique constraint uses NULLS NOT DISTINCT (Postgres 15+) so that
-- NULL tenant_id (system-level calls) is treated as equal for conflict
-- detection during the upsert in lib/retention/run.ts.

CREATE TABLE "ai_usage_monthly_summaries" (
  "id"                     TEXT        NOT NULL,
  "tenant_id"              UUID,
  "route"                  TEXT        NOT NULL,
  "model"                  TEXT        NOT NULL,
  "year_month"             TEXT        NOT NULL,
  "call_count"             INTEGER     NOT NULL,
  "success_count"          INTEGER     NOT NULL,
  "total_input_tokens"     BIGINT      NOT NULL,
  "total_output_tokens"    BIGINT      NOT NULL,
  "total_cache_read_tokens" BIGINT     NOT NULL,
  "total_duration_ms"      BIGINT      NOT NULL,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ai_usage_monthly_summaries_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: NULLs are equal for uniqueness checking (Postgres 15+)
ALTER TABLE "ai_usage_monthly_summaries"
  ADD CONSTRAINT "ai_usage_monthly_summaries_tenant_id_route_model_year_month_key"
  UNIQUE NULLS NOT DISTINCT ("tenant_id", "route", "model", "year_month");

CREATE INDEX "ai_usage_monthly_summaries_year_month_idx"
  ON "ai_usage_monthly_summaries" ("year_month");

CREATE INDEX "ai_usage_monthly_summaries_tenant_id_year_month_idx"
  ON "ai_usage_monthly_summaries" ("tenant_id", "year_month");

CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "route" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_logs_tenant_id_occurred_at_idx" ON "ai_usage_logs"("tenant_id", "occurred_at");
CREATE INDEX "ai_usage_logs_route_occurred_at_idx" ON "ai_usage_logs"("route", "occurred_at");
CREATE INDEX "ai_usage_logs_occurred_at_idx" ON "ai_usage_logs"("occurred_at");

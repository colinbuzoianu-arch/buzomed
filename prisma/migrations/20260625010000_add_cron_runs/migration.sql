CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "finished_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL,
    "items_processed" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error_message" TEXT,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cron_runs_job_name_started_at_idx" ON "cron_runs"("job_name", "started_at");
CREATE INDEX "cron_runs_started_at_idx" ON "cron_runs"("started_at");

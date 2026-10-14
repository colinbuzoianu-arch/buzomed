-- Import history & tracking (import spec §8).
--
-- Three concerns, all additive and backward-compatible (every new column is
-- nullable or has a default, every FK is ON DELETE SET NULL):
--
--   1. import_jobs becomes a lifecycle record, created as 'running' BEFORE
--      any employee is touched so a trace survives a half-way abort, and
--      carries the PII-free per-row result set ("results") plus cancellation
--      bookkeeping.
--   2. employees / workplaces / recalls get a nullable import_job_id so each
--      import can be attributed and, for employees, rolled back.
--   3. Supporting indexes for the history list and the cancel lookup.

-- ── import_jobs: lifecycle + results + cancellation ──────────────────────
ALTER TABLE "import_jobs" ADD COLUMN "file_name" TEXT;
ALTER TABLE "import_jobs" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'running';
ALTER TABLE "import_jobs" ADD COLUMN "results" JSONB;
ALTER TABLE "import_jobs" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "import_jobs" ADD COLUMN "cancelled_by_user_id" TEXT;
ALTER TABLE "import_jobs" ADD COLUMN "removed_employee_count" INTEGER;
ALTER TABLE "import_jobs" ADD COLUMN "kept_employee_count" INTEGER;
ALTER TABLE "import_jobs" ADD COLUMN "finished_at" TIMESTAMP(3);

-- Existing rows predate the lifecycle: they are finished imports, so mark
-- them 'completed' rather than leaving them as the 'running' default.
UPDATE "import_jobs" SET "status" = 'completed', "finished_at" = "created_at" WHERE "status" = 'running';

CREATE INDEX "import_jobs_tenant_id_status_idx" ON "import_jobs"("tenant_id", "status");

-- ── per-import attribution columns ───────────────────────────────────────
ALTER TABLE "employees" ADD COLUMN "import_job_id" TEXT;
ALTER TABLE "workplaces" ADD COLUMN "import_job_id" TEXT;
ALTER TABLE "recalls" ADD COLUMN "import_job_id" TEXT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_import_job_id_fkey"
  FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_import_job_id_fkey"
  FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_import_job_id_fkey"
  FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "employees_tenant_id_import_job_id_idx" ON "employees"("tenant_id", "import_job_id");
CREATE INDEX "workplaces_tenant_id_import_job_id_idx" ON "workplaces"("tenant_id", "import_job_id");
CREATE INDEX "recalls_tenant_id_import_job_id_idx" ON "recalls"("tenant_id", "import_job_id");

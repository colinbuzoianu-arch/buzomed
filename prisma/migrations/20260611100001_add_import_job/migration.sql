-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "initiated_by_user_id" TEXT NOT NULL,
    "fallback_company_id" TEXT,
    "total_rows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "companies_created" INTEGER NOT NULL,
    "workplaces_created" INTEGER NOT NULL,
    "rows_without_company" INTEGER NOT NULL,
    "rows_without_workplace" INTEGER NOT NULL,
    "flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_tenant_id_created_at_idx" ON "import_jobs"("tenant_id", "created_at");

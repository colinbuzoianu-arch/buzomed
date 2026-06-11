-- CreateTable
CREATE TABLE "system_error_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "error_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_error_logs_created_at_idx" ON "system_error_logs"("created_at");

-- CreateIndex
CREATE INDEX "system_error_logs_tenant_id_idx" ON "system_error_logs"("tenant_id");

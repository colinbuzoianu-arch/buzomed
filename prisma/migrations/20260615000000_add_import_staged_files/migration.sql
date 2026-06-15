-- CreateTable
CREATE TABLE "import_staged_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_staged_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_staged_files_tenant_id_idx" ON "import_staged_files"("tenant_id");

-- AddForeignKey
ALTER TABLE "import_staged_files" ADD CONSTRAINT "import_staged_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_staged_files" ADD CONSTRAINT "import_staged_files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

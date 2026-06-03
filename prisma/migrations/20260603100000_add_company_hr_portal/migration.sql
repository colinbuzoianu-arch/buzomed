-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'company_hr';

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "company_hr_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_hr_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_hr_assignments_user_id_idx" ON "company_hr_assignments"("user_id");

-- CreateIndex
CREATE INDEX "company_hr_assignments_company_id_idx" ON "company_hr_assignments"("company_id");

-- CreateIndex
CREATE INDEX "company_hr_assignments_tenant_id_idx" ON "company_hr_assignments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_hr_assignments_user_id_company_id_key" ON "company_hr_assignments"("user_id", "company_id");

-- AddForeignKey
ALTER TABLE "company_hr_assignments" ADD CONSTRAINT "company_hr_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hr_assignments" ADD CONSTRAINT "company_hr_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hr_assignments" ADD CONSTRAINT "company_hr_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

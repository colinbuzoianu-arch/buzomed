ALTER TABLE "tenants" ADD COLUMN "anonymized_at" TIMESTAMPTZ;
ALTER TABLE "tenants" ADD COLUMN "anonymized_by" UUID;

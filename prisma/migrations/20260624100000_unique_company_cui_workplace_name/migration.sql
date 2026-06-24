-- Partial unique index: one active company per (tenant, CUI).
-- WHERE clause excludes soft-deleted rows and rows with no CUI, so the
-- constraint only fires when it matters. Prisma @@unique doesn't support
-- WHERE clauses, so we use a raw migration.
CREATE UNIQUE INDEX "companies_tenant_cui_unique"
    ON "companies" ("tenant_id", "cui")
    WHERE "deleted_at" IS NULL AND "cui" IS NOT NULL;

-- Partial unique index: one active workplace per (company, name) case-insensitively.
-- lower(name) catches "Production" vs "production" as the same slot.
CREATE UNIQUE INDEX "workplaces_company_name_unique"
    ON "workplaces" ("company_id", lower("name"))
    WHERE "deleted_at" IS NULL;

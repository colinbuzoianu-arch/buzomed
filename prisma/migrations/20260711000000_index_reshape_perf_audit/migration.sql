-- Index reshape from the performance audit (§10 of performance-audit-report.md).
-- Every ADD targets a real composite query shape found by grepping actual
-- where: clauses in app/ and lib/; every DROP is a single-column index
-- confirmed never queried standalone anywhere in the codebase (always paired
-- with tenantId, usually deletedAt).

-- ── Company ──────────────────────────────────────────────────────────────
DROP INDEX "companies_cui_idx";
CREATE INDEX "companies_tenant_id_cui_idx" ON "companies" ("tenant_id", "cui");

-- ── Contract ─────────────────────────────────────────────────────────────
DROP INDEX "contracts_company_id_idx";
DROP INDEX "contracts_deleted_at_idx";
DROP INDEX "contracts_tenant_id_status_idx";
CREATE INDEX "contracts_tenant_id_company_id_deleted_at_status_idx"
    ON "contracts" ("tenant_id", "company_id", "deleted_at", "status");

-- ── Invoice ──────────────────────────────────────────────────────────────
DROP INDEX "invoices_company_id_idx";
DROP INDEX "invoices_deleted_at_idx";
DROP INDEX "invoices_tenant_id_status_idx";
CREATE INDEX "invoices_tenant_id_company_id_deleted_at_idx"
    ON "invoices" ("tenant_id", "company_id", "deleted_at");
CREATE INDEX "invoices_tenant_id_deleted_at_issued_at_idx"
    ON "invoices" ("tenant_id", "deleted_at", "issued_at");

-- ── Workplace — weakest-covered model pre-fix (zero composites) ────────────
DROP INDEX "workplaces_company_id_idx";
CREATE INDEX "workplaces_tenant_id_company_id_deleted_at_idx"
    ON "workplaces" ("tenant_id", "company_id", "deleted_at");
CREATE INDEX "workplaces_tenant_id_deleted_at_is_active_idx"
    ON "workplaces" ("tenant_id", "deleted_at", "is_active");

-- ── Employee ─────────────────────────────────────────────────────────────
DROP INDEX "employees_archived_at_idx";
DROP INDEX "employees_company_id_idx";
CREATE INDEX "employees_tenant_id_company_id_deleted_at_idx"
    ON "employees" ("tenant_id", "company_id", "deleted_at");
CREATE INDEX "employees_tenant_id_is_active_archived_at_deleted_at_idx"
    ON "employees" ("tenant_id", "is_active", "archived_at", "deleted_at");

-- ── PlatformInvoice (bonus, lower priority — already the best-covered model) ─
DROP INDEX "platform_invoices_deleted_at_idx";
DROP INDEX "platform_invoices_status_idx";
CREATE INDEX "platform_invoices_status_deleted_at_idx"
    ON "platform_invoices" ("status", "deleted_at");

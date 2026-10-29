-- Puncte de lucru (WorkSite) — the employer's territorial unit (branch /
-- sucursală: Geoagiu, Brad, Hunedoara, P.L. Ilia), kept separate from the
-- Workplace ("loc de muncă" / activity + risk unit). See schema.prisma.
--
-- ADDITIVE ONLY. Nothing here drops a column or touches existing rows:
--   * a new table `work_sites`
--   * a new nullable column `workplaces.work_site_id` (defaults to NULL, so
--     every existing workplace keeps behaving exactly as before)
--   * the workplace uniqueness index is widened to include the (coalesced)
--     site, which is behaviour-preserving for the all-NULL existing rows.
--
-- The one existing object we replace is the workplace partial unique index:
-- old key (company_id, lower(name)) → new key
-- (company_id, COALESCE(work_site_id, <nil uuid>), lower(name)). Because every
-- current row has work_site_id = NULL, COALESCE maps them all to the same nil
-- sentinel, so the new index enforces the IDENTICAL constraint on today's data
-- (one active workplace per company+name) while additionally allowing the same
-- activity name to repeat across different sites. No current row can violate
-- it, so the CREATE cannot fail on existing data.

-- ── work_sites table ────────────────────────────────────────────────────
CREATE TABLE "work_sites" (
    "id"                 UUID         NOT NULL,
    "tenant_id"          UUID         NOT NULL,
    "company_id"         UUID         NOT NULL,
    "name"               TEXT         NOT NULL,
    "address_line1"      TEXT,
    "city"               TEXT,
    "county"             TEXT,
    "is_active"          BOOLEAN      NOT NULL DEFAULT true,
    "import_job_id"      TEXT,
    "created_by_user_id" UUID,
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ  NOT NULL,
    "deleted_at"         TIMESTAMPTZ,
    CONSTRAINT "work_sites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_sites_tenant_id_idx" ON "work_sites" ("tenant_id");
CREATE INDEX "work_sites_tenant_id_company_id_deleted_at_idx"
    ON "work_sites" ("tenant_id", "company_id", "deleted_at");
CREATE INDEX "work_sites_tenant_id_import_job_id_idx"
    ON "work_sites" ("tenant_id", "import_job_id");

-- One active site per (company, name), case-insensitive, soft-delete-aware —
-- the same shape as workplaces_company_name_unique.
CREATE UNIQUE INDEX "work_sites_company_name_unique"
    ON "work_sites" ("company_id", lower("name"))
    WHERE "deleted_at" IS NULL;

ALTER TABLE "work_sites"
    ADD CONSTRAINT "work_sites_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_sites"
    ADD CONSTRAINT "work_sites_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_sites"
    ADD CONSTRAINT "work_sites_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_sites"
    ADD CONSTRAINT "work_sites_import_job_id_fkey"
    FOREIGN KEY ("import_job_id") REFERENCES "import_jobs" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── workplaces.work_site_id ───────────────────────────────────────────────
ALTER TABLE "workplaces" ADD COLUMN "work_site_id" UUID;

CREATE INDEX "workplaces_work_site_id_idx" ON "workplaces" ("work_site_id");

ALTER TABLE "workplaces"
    ADD CONSTRAINT "workplaces_work_site_id_fkey"
    FOREIGN KEY ("work_site_id") REFERENCES "work_sites" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── widen the workplace uniqueness to (company, site, name) ───────────────
-- Behaviour-preserving for existing (all-NULL-site) rows; see header note.
DROP INDEX "workplaces_company_name_unique";

CREATE UNIQUE INDEX "workplaces_company_site_name_unique"
    ON "workplaces" (
        "company_id",
        COALESCE("work_site_id", '00000000-0000-0000-0000-000000000000'::uuid),
        lower("name")
    )
    WHERE "deleted_at" IS NULL;

-- ── Row Level Security ────────────────────────────────────────────────────
-- Match every other tenant-scoped table (see 20260510065838_rls_policies).
-- The app connects as the postgres owner, which BYPASSES RLS, so these are
-- dormant today exactly like the other tables' policies — but enabling +
-- policing keeps work_sites consistent for when the RLS-respecting buzomed_app
-- role is activated (handoff C.2d), and it closes direct anon/authenticated
-- PostgREST access to the table in the meantime. The SELECT/INSERT/UPDATE/
-- DELETE grant to buzomed_app is automatic via the ALTER DEFAULT PRIVILEGES set
-- in the rls_foundation migration, so no explicit GRANT is needed here.
-- Relies on app_auth.is_super_admin() / app_auth.current_tenant_id() (C.1).
ALTER TABLE public.work_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_sites_all_super_admin ON public.work_sites
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY work_sites_all_tenant_member ON public.work_sites
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

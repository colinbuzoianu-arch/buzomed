-- Enable RLS on tables added after the initial RLS migration.
-- These tables were created in later sessions without RLS, leaving them
-- publicly accessible via the Supabase PostgREST REST API (anon role).
--
-- Tables covered:
--   contracts     — created outside migration history via direct SQL
--   invoices      — created in session_15_invoices, no RLS added
--   invoice_items — created in session_15_invoices, no RLS added
--
-- Pattern matches all other tenant-scoped tables in 20260510065838_rls_policies:
--   super_admin bypass + tenant_id = current_tenant_id() for all operations.
--
-- NOTE: the app connects as the postgres superuser (DATABASE_URL), which
-- bypasses RLS entirely. These policies only become active if/when the app
-- is migrated to the `buzomed_app` role (Phase C.2d). Enabling RLS now
-- blocks anonymous PostgREST access and resolves the Supabase security alert.

ALTER TABLE public.contracts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- contracts
CREATE POLICY contracts_all_super_admin ON public.contracts
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY contracts_all_tenant_member ON public.contracts
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

-- invoices
CREATE POLICY invoices_all_super_admin ON public.invoices
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY invoices_all_tenant_member ON public.invoices
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

-- invoice_items (has its own tenant_id column)
CREATE POLICY invoice_items_all_super_admin ON public.invoice_items
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY invoice_items_all_tenant_member ON public.invoice_items
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

-- RLS for import_staged_files
-- Apply manually in Supabase SQL Editor after running the main migration

ALTER TABLE public.import_staged_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_staged_files_tenant ON public.import_staged_files
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

CREATE POLICY import_staged_files_super_admin ON public.import_staged_files
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

ALTER TABLE public.company_hr_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY chr_super_admin ON public.company_hr_assignments
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY chr_tenant ON public.company_hr_assignments
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());

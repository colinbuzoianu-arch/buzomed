-- RLS for API keys and webhooks tables
-- Apply this manually in Supabase SQL Editor after running the main migration

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_tenant ON public.api_keys FOR ALL USING (tenant_id = app_auth.current_tenant_id()) WITH CHECK (tenant_id = app_auth.current_tenant_id());
CREATE POLICY api_keys_super_admin ON public.api_keys FOR ALL USING (app_auth.is_super_admin()) WITH CHECK (app_auth.is_super_admin());
CREATE POLICY webhook_endpoints_tenant ON public.webhook_endpoints FOR ALL USING (tenant_id = app_auth.current_tenant_id()) WITH CHECK (tenant_id = app_auth.current_tenant_id());
CREATE POLICY webhook_endpoints_super_admin ON public.webhook_endpoints FOR ALL USING (app_auth.is_super_admin()) WITH CHECK (app_auth.is_super_admin());
CREATE POLICY webhook_deliveries_tenant ON public.webhook_deliveries FOR ALL USING (EXISTS (SELECT 1 FROM public.webhook_endpoints we WHERE we.id = endpoint_id AND we.tenant_id = app_auth.current_tenant_id()));
CREATE POLICY webhook_deliveries_super_admin ON public.webhook_deliveries FOR ALL USING (app_auth.is_super_admin()) WITH CHECK (app_auth.is_super_admin());

-- Enable RLS on platform billing tables (Stripe/subscription layer).
-- These tables are super-admin / platform-scoped, not tenant-scoped.
-- The app connects as postgres (superuser) so RLS is bypassed in practice;
-- enabling it here blocks anonymous PostgREST access (Supabase security alert).

ALTER TABLE public.platform_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions          ENABLE ROW LEVEL SECURITY;

-- platform_invoices — super-admin only
CREATE POLICY platform_invoices_super_admin ON public.platform_invoices
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

-- platform_invoice_items — super-admin only
CREATE POLICY platform_invoice_items_super_admin ON public.platform_invoice_items
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

-- plans — publicly readable (pricing page), super-admin can write
CREATE POLICY plans_read_all ON public.plans
  FOR SELECT
  USING (true);

CREATE POLICY plans_write_super_admin ON public.plans
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

-- subscriptions — tenant-scoped read + super-admin full access
CREATE POLICY subscriptions_super_admin ON public.subscriptions
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY subscriptions_tenant ON public.subscriptions
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());
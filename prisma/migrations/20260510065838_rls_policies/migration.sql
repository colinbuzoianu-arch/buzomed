-- =============================================================================
-- Phase C.2 — RLS policies
--
-- Enables RLS on all tenant-scoped tables and adds per-(table, role, op)
-- policies. Uses the app_auth.* helpers from C.1 to read auth context
-- from per-request GUCs.
--
-- DEPLOYMENT NOTE: applying this migration alone does NOT yet enforce
-- RLS for your application, because Prisma still connects as the
-- `postgres` superuser via DATABASE_URL. Postgres bypasses RLS for
-- superusers and table owners. So after this migration:
--   - The policies exist
--   - But Prisma queries still see everything (unchanged behavior)
--   - Only `SET ROLE buzomed_app` sessions in psql/SQL Editor will be
--     subject to the policies
--
-- The actual enforcement turns on when Phase C.2c switches code to use
-- `prismaApp` (which connects as `buzomed_app`). That's a route-by-route
-- migration to control blast radius.
--
-- POLICY DESIGN:
--
-- Each policy is named `<table>_<operation>_<role>` so debugging is easy.
-- Examples:
--   tenants_select_super_admin    — super admin can read any tenant
--   tenants_select_member         — non-super users see only their own tenant
--   companies_select_member       — non-super users see only their tenant's companies
--   invitations_insert_inviter    — inviter must be allowed by canInvite logic
--
-- The pattern for tenant-scoped tables is:
--   - SELECT: allow if super_admin OR row.tenant_id = current_tenant_id()
--   - INSERT: same (you can only insert into your own tenant)
--   - UPDATE: same
--   - DELETE: same, often further restricted to specific roles
--
-- Special cases handled separately:
--   - Tenant itself: super_admin sees all; users see only their tenant
--   - User: complex — super_admin sees all, users see members of their tenant,
--     a user can always see their own row
--   - Invitation: insert/update/delete restricted to roles that canInvite
--   - AuditLogEntry: read-only for non-super; super sees all
--   - ExaminationType: system reference, all authenticated read, super_admin write
--   - DocumentTemplate: hybrid — system templates visible to all, tenant
--     templates scoped to tenant
--
-- Notes for reviewer:
--
-- 1. Every table gets an "always-deny" baseline (not strictly needed since
--    RLS ON without any policy is already deny-all, but explicit is clearer).
--    Actually, we omit explicit deny — Postgres default-denies when RLS is
--    enabled and no policy matches. Keeping policies positive (allow what
--    you want) is the convention.
--
-- 2. We use FOR ALL where the same predicate applies to all operations to
--    keep the migration shorter. Where INSERT semantics differ from SELECT
--    (e.g., you can't INSERT a row whose tenant_id you can't read), Postgres
--    handles that automatically: WITH CHECK runs on INSERT/UPDATE.
--
-- 3. Policies use app_auth.is_super_admin() as a bypass. This is because
--    super_admin has tenant_id = NULL and `current_tenant_id() = row.tenant_id`
--    would always be false for them. The bypass makes that explicit.
--
-- 4. We DO NOT add policies on the `tenants` table for INSERT — only
--    super_admin creates tenants, and that endpoint will continue to use
--    `prisma` (superuser) since it's a privileged bootstrap operation.
--    Same logic applies to a few other tables flagged below.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Enable RLS on every tenant-scoped table
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenants                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workplaces                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_workplace_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_types                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccinations                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_events                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recalls                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations                      ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 2. tenants — top of the hierarchy, special handling
-- -----------------------------------------------------------------------------

-- super_admin sees every tenant
CREATE POLICY tenants_select_super_admin ON public.tenants
  FOR SELECT
  USING (app_auth.is_super_admin());

-- All other authenticated users see only their own tenant
CREATE POLICY tenants_select_member ON public.tenants
  FOR SELECT
  USING (id = app_auth.current_tenant_id());

-- Only super_admin can update tenants (subscription changes, settings, etc.)
CREATE POLICY tenants_update_super_admin ON public.tenants
  FOR UPDATE
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

-- INSERT and DELETE on tenants intentionally have NO policy.
-- These remain superuser-only operations done via `prisma` (admin client).
-- Tenant creation is bootstrap; tenant deletion is rare and dangerous.


-- -----------------------------------------------------------------------------
-- 3. users — complex: own row always visible, plus tenant scope
-- -----------------------------------------------------------------------------

-- super_admin sees every user
CREATE POLICY users_select_super_admin ON public.users
  FOR SELECT
  USING (app_auth.is_super_admin());

-- A user can always see their own row (regardless of tenant)
CREATE POLICY users_select_self ON public.users
  FOR SELECT
  USING (id = app_auth.current_user_id());

-- Users see members of their own tenant
CREATE POLICY users_select_tenant_members ON public.users
  FOR SELECT
  USING (tenant_id = app_auth.current_tenant_id());

-- Updates: super_admin can update anyone; user can update their own row
-- (but not change roles or tenant_id — that's enforced in app code, not here)
CREATE POLICY users_update_super_admin ON public.users
  FOR UPDATE
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (id = app_auth.current_user_id())
  WITH CHECK (id = app_auth.current_user_id());

-- practice_admin can update users in their tenant (role changes, deactivation)
CREATE POLICY users_update_practice_admin ON public.users
  FOR UPDATE
  USING (
    tenant_id = app_auth.current_tenant_id()
    AND app_auth.has_role('practice_admin')
  )
  WITH CHECK (
    tenant_id = app_auth.current_tenant_id()
    AND app_auth.has_role('practice_admin')
  );

-- INSERT on users intentionally has NO policy.
-- User creation is a bootstrap path: it happens during tenant creation
-- (admin client) and during invite acceptance (admin client). The app
-- Prisma role should never directly INSERT users — that's the contract.

-- DELETE on users intentionally has NO policy. Soft delete via deletedAt
-- is the model; UPDATE policies cover that.


-- -----------------------------------------------------------------------------
-- 4. invitations — uses application logic, mirrored at policy level
-- -----------------------------------------------------------------------------

-- super_admin sees every invitation
CREATE POLICY invitations_select_super_admin ON public.invitations
  FOR SELECT
  USING (app_auth.is_super_admin());

-- Tenant members see invitations for their tenant
CREATE POLICY invitations_select_tenant_member ON public.invitations
  FOR SELECT
  USING (tenant_id = app_auth.current_tenant_id());

-- Inserting an invitation: actor must be allowed to invite that role into
-- that tenant. We mirror canInvite() logic in SQL, but coarsely:
--   - super_admin can invite practice_admin to any tenant (we don't enforce
--     the role-of-invitee distinction in the policy because it's complex
--     and the app already validates via canInvite())
--   - non-super: must be in the same tenant AND have one of the inviting
--     roles
-- Important: invited_by_user_id must equal current_user_id (you can only
-- invite as yourself).
CREATE POLICY invitations_insert_super_admin ON public.invitations
  FOR INSERT
  WITH CHECK (
    app_auth.is_super_admin()
    AND invited_by_user_id = app_auth.current_user_id()
  );

CREATE POLICY invitations_insert_tenant_member ON public.invitations
  FOR INSERT
  WITH CHECK (
    tenant_id = app_auth.current_tenant_id()
    AND invited_by_user_id = app_auth.current_user_id()
    AND (
      app_auth.has_role('practice_admin')
      OR app_auth.has_role('practitioner')
    )
  );

-- Updating an invitation (revoke is the main case — sets revoked_at).
-- Same predicate as insert.
CREATE POLICY invitations_update_super_admin ON public.invitations
  FOR UPDATE
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY invitations_update_tenant_member ON public.invitations
  FOR UPDATE
  USING (
    tenant_id = app_auth.current_tenant_id()
    AND (
      app_auth.has_role('practice_admin')
      OR app_auth.has_role('practitioner')
    )
  )
  WITH CHECK (
    tenant_id = app_auth.current_tenant_id()
  );

-- DELETE: no policy. Invitations are revoked (soft) not deleted.

-- SPECIAL: the public accept-invite flow needs to read an invitation by
-- token_hash WITHOUT being authenticated. RLS would block this. The
-- accept-service runs through the admin client (`prisma`, superuser)
-- which bypasses RLS. So this is handled at the app level: the validate
-- and accept paths use admin client, the in-app paths (list, create,
-- revoke from /super-admin or /team UIs) use the app client.


-- -----------------------------------------------------------------------------
-- 5. locations — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY locations_all_super_admin ON public.locations
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY locations_all_tenant_member ON public.locations
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 6. user_location_assignments — derived: scope by user's tenant
-- -----------------------------------------------------------------------------

-- This table doesn't have its own tenant_id. We must JOIN through users.
-- Since policies can't use joins directly in USING/WITH CHECK (well, they
-- can via subqueries, just slower), we use EXISTS subqueries.

CREATE POLICY user_location_assignments_select_super_admin ON public.user_location_assignments
  FOR SELECT
  USING (app_auth.is_super_admin());

CREATE POLICY user_location_assignments_select_tenant_member ON public.user_location_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_location_assignments.user_id
        AND u.tenant_id = app_auth.current_tenant_id()
    )
  );

-- Modifications: super_admin or practice_admin in same tenant
CREATE POLICY user_location_assignments_modify_super_admin ON public.user_location_assignments
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY user_location_assignments_modify_practice_admin ON public.user_location_assignments
  FOR ALL
  USING (
    app_auth.has_role('practice_admin')
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_location_assignments.user_id
        AND u.tenant_id = app_auth.current_tenant_id()
    )
  )
  WITH CHECK (
    app_auth.has_role('practice_admin')
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_location_assignments.user_id
        AND u.tenant_id = app_auth.current_tenant_id()
    )
  );


-- -----------------------------------------------------------------------------
-- 7. companies — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY companies_all_super_admin ON public.companies
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY companies_all_tenant_member ON public.companies
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 8. workplaces — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY workplaces_all_super_admin ON public.workplaces
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY workplaces_all_tenant_member ON public.workplaces
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 9. employees — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY employees_all_super_admin ON public.employees
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY employees_all_tenant_member ON public.employees
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 10. employee_workplace_assignments — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY ewa_all_super_admin ON public.employee_workplace_assignments
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY ewa_all_tenant_member ON public.employee_workplace_assignments
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 11. examinations — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY examinations_all_super_admin ON public.examinations
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY examinations_all_tenant_member ON public.examinations
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 12. examination_types — system-wide reference table, all authenticated can read
-- -----------------------------------------------------------------------------

-- Anyone authenticated can read the catalog of examination types.
-- We allow this for any user with a valid current_user_id (i.e., signed in).
CREATE POLICY examination_types_select_authenticated ON public.examination_types
  FOR SELECT
  USING (app_auth.current_user_id() IS NOT NULL);

-- Only super_admin can write.
CREATE POLICY examination_types_modify_super_admin ON public.examination_types
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());


-- -----------------------------------------------------------------------------
-- 13. documents — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY documents_all_super_admin ON public.documents
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY documents_all_tenant_member ON public.documents
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 14. document_templates — hybrid: system templates (tenant_id NULL) visible
--     to all authenticated; tenant templates scoped
-- -----------------------------------------------------------------------------

CREATE POLICY document_templates_select_super_admin ON public.document_templates
  FOR SELECT
  USING (app_auth.is_super_admin());

-- All authenticated users can see system templates (those with no tenant)
CREATE POLICY document_templates_select_system ON public.document_templates
  FOR SELECT
  USING (tenant_id IS NULL AND app_auth.current_user_id() IS NOT NULL);

-- Tenant members see their tenant's templates
CREATE POLICY document_templates_select_tenant ON public.document_templates
  FOR SELECT
  USING (tenant_id = app_auth.current_tenant_id());

-- Modifications: super_admin OR practice_admin in same tenant
CREATE POLICY document_templates_modify_super_admin ON public.document_templates
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY document_templates_modify_practice_admin ON public.document_templates
  FOR ALL
  USING (
    tenant_id = app_auth.current_tenant_id()
    AND app_auth.has_role('practice_admin')
  )
  WITH CHECK (
    tenant_id = app_auth.current_tenant_id()
    AND app_auth.has_role('practice_admin')
  );


-- -----------------------------------------------------------------------------
-- 15. vaccinations — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY vaccinations_all_super_admin ON public.vaccinations
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY vaccinations_all_tenant_member ON public.vaccinations
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 16. medical_events — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY medical_events_all_super_admin ON public.medical_events
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY medical_events_all_tenant_member ON public.medical_events
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 17. recalls — pure tenant scope
-- -----------------------------------------------------------------------------

CREATE POLICY recalls_all_super_admin ON public.recalls
  FOR ALL
  USING (app_auth.is_super_admin())
  WITH CHECK (app_auth.is_super_admin());

CREATE POLICY recalls_all_tenant_member ON public.recalls
  FOR ALL
  USING (tenant_id = app_auth.current_tenant_id())
  WITH CHECK (tenant_id = app_auth.current_tenant_id());


-- -----------------------------------------------------------------------------
-- 18. audit_log_entries — read-only for non-super; super sees all
-- -----------------------------------------------------------------------------

-- super_admin sees all audit logs (including those with NULL tenant_id, which
-- represent super_admin actions without a tenant context).
CREATE POLICY audit_log_select_super_admin ON public.audit_log_entries
  FOR SELECT
  USING (app_auth.is_super_admin());

-- Tenant members see audit entries for their tenant.
CREATE POLICY audit_log_select_tenant ON public.audit_log_entries
  FOR SELECT
  USING (tenant_id = app_auth.current_tenant_id());

-- INSERT: any authenticated user can write an audit entry for their own tenant.
-- This is how the app records actions. user_id and tenant_id must match
-- the current actor.
CREATE POLICY audit_log_insert_authenticated ON public.audit_log_entries
  FOR INSERT
  WITH CHECK (
    user_id = app_auth.current_user_id()
    AND (
      tenant_id = app_auth.current_tenant_id()
      OR (tenant_id IS NULL AND app_auth.is_super_admin())
    )
  );

-- UPDATE/DELETE on audit logs intentionally have NO policy.
-- Audit entries are append-only.


-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------

COMMENT ON SCHEMA app_auth IS
  'Helper functions for reading per-request auth context from GUCs. '
  'Used by RLS policies (added in Phase C.2) to determine the current user, '
  'tenant, and roles.';

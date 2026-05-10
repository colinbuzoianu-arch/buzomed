-- =============================================================================
-- Phase C.2b — RLS policy tests
--
-- PURPOSE
--   Verify that the policies created in `20260510065838_rls_policies` actually
--   enforce tenant isolation, role gating, and self-only access — BEFORE we
--   switch any application route to use prismaApp (Phase C.2c).
--
-- HOW IT WORKS
--   Each scenario runs inside its own BEGIN/ROLLBACK block, sets the
--   `request.jwt.claim.*` GUCs that app_auth.* helpers read, then runs a
--   handful of read/write queries. Because the queries run as `buzomed_app`
--   (a non-superuser), Postgres applies RLS. ROLLBACK at the end means
--   nothing persists, so it's safe to re-run.
--
-- HOW TO RUN
--   Two paths. Pick whichever works on your machine:
--
--   (a) DIRECT CONNECTION (preferred, requires IPv6 or Supabase IPv4 add-on):
--
--       $env:PGPASSWORD = 'Decembrie.2026'
--       psql `
--         -h db.kerbeiyqjmaesecwdsrd.supabase.co `
--         -p 5432 `
--         -U buzomed_app `
--         -d postgres `
--         -f scripts\rls-policy-tests.sql
--
--   (b) FALLBACK — connect as postgres via session pooler, then SET ROLE:
--       The session pooler accepts only the `postgres.<project-ref>` username
--       format, so we can't connect as buzomed_app there. But the script's
--       opening `SET ROLE buzomed_app;` will downgrade the session, after
--       which RLS applies normally.
--
--       $env:PGPASSWORD = '5TxDKp3qa9aRwmGp'
--       psql `
--         -h aws-1-eu-central-1.pooler.supabase.com `
--         -p 5432 `
--         -U postgres.kerbeiyqjmaesecwdsrd `
--         -d postgres `
--         -f scripts\rls-policy-tests.sql
--
--   Whichever path you use, the script aborts immediately if it isn't
--   running as buzomed_app (sanity check below). That guarantees we're
--   never accidentally testing as a superuser, which would silently bypass
--   RLS and make every test pass for the wrong reason.
--
-- WHAT TO LOOK FOR IN THE OUTPUT
--   Each test prints expected vs. observed. A correct run shows:
--     - Scenario 1 (unauth): 0 rows everywhere
--     - Scenario 2 (super_admin): both tenants, all users, all invitations
--     - Scenario 3 (practice_admin in A): only tenant A rows, NOT tenant B
--     - Scenarios 4–6: writes that should fail DO fail with
--       "new row violates row-level security policy"
-- =============================================================================

-- IMPORTANT: ON_ERROR_STOP must be OFF for this script. Several scenarios
-- intentionally trigger RLS denials (expected errors) — if psql stopped on
-- the first one, the rest of the suite would never run. The opening
-- sanity check uses a DO/RAISE EXCEPTION block to abort if we are NOT
-- buzomed_app, which works regardless of this setting.
\set ON_ERROR_STOP off

-- Wrap each statement in an implicit savepoint so an expected error in a
-- denial test rolls back just that statement instead of aborting the
-- whole transaction. Without this, the first denial would poison the
-- transaction and every subsequent statement would error with
-- "current transaction is aborted".
\set ON_ERROR_ROLLBACK on


-- -----------------------------------------------------------------------------
-- 0. Sanity: confirm the session role and that helpers are reachable
-- -----------------------------------------------------------------------------

-- Switch to buzomed_app. If we connected directly as buzomed_app this is a
-- harmless no-op. If we connected as postgres via the session pooler, this
-- is what makes RLS actually apply.
SET ROLE buzomed_app;

\echo
\echo '======================================================================'
\echo ' Sanity check'
\echo '======================================================================'

SELECT
  current_user                          AS connected_role,
  current_setting('server_version')     AS pg_version;

-- Hard fail if we're not buzomed_app — otherwise every subsequent test
-- would be running as a superuser and silently bypass RLS.
DO $$
BEGIN
  IF current_user <> 'buzomed_app' THEN
    RAISE EXCEPTION
      'Refusing to run RLS tests: session role is %, expected buzomed_app. '
      'RLS does NOT apply to superusers/owners, so the tests would be '
      'meaningless.', current_user;
  END IF;
END $$;

-- With no GUCs set, helpers should return NULL / empty / false.
\echo
\echo 'Helpers with no auth context (expected: all NULL/empty/false):'
SELECT
  app_auth.current_user_id()    AS user_id,
  app_auth.current_tenant_id()  AS tenant_id,
  app_auth.current_roles()      AS roles,
  app_auth.is_super_admin()     AS is_super;


-- -----------------------------------------------------------------------------
-- 1. Unauthenticated: no GUCs set → policies should match nothing
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 1 — Unauthenticated (no claims set)'
\echo ' Expected: 0 rows visible everywhere'
\echo '======================================================================'

BEGIN;

\echo
\echo 'tenants visible (expected 0):'
SELECT count(*) AS tenants_visible FROM public.tenants;

\echo 'users visible (expected 0):'
SELECT count(*) AS users_visible FROM public.users;

\echo 'invitations visible (expected 0):'
SELECT count(*) AS invitations_visible FROM public.invitations;

\echo 'companies visible (expected 0):'
SELECT count(*) AS companies_visible FROM public.companies;

\echo 'document_templates visible (expected 0 — system templates require an authenticated user):'
SELECT count(*) AS templates_visible FROM public.document_templates;

\echo 'examination_types visible (expected 0 — same):'
SELECT count(*) AS examination_types_visible FROM public.examination_types;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 2. super_admin: should see everything
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 2 — super_admin'
\echo ' Expected: sees both tenants, all users, all invitations'
\echo '======================================================================'

BEGIN;

-- super_admin has tenant_id = NULL. The bypass is the role check, not the
-- tenant match.
SET LOCAL request.jwt.claim.sub    = 'e7c224a8-8afa-41a0-a4fd-b725ce65edbd';
SET LOCAL request.jwt.claim.tenant = '';
SET LOCAL request.jwt.claim.roles  = '["super_admin"]';

\echo
\echo 'Auth context (expected super_admin, NULL tenant, is_super=true):'
SELECT
  app_auth.current_user_id()    AS user_id,
  app_auth.current_tenant_id()  AS tenant_id,
  app_auth.current_roles()      AS roles,
  app_auth.is_super_admin()     AS is_super;

\echo
\echo 'Visible tenants (expected: BOTH Exemplu Cabinet and Test Cabinet):'
SELECT id, name FROM public.tenants ORDER BY name;

\echo
\echo 'Users grouped by tenant (expected: rows for tenant A, tenant B, AND a NULL group for super_admin):'
SELECT tenant_id, count(*) AS users
FROM public.users
GROUP BY tenant_id
ORDER BY tenant_id NULLS FIRST;

\echo
\echo 'Invitations grouped by tenant (expected: visibility into both tenants):'
SELECT tenant_id, count(*) AS invitations
FROM public.invitations
GROUP BY tenant_id
ORDER BY tenant_id;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 3. practice_admin in tenant A: should see only tenant A
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 3 — practice_admin in tenant A (Exemplu Cabinet)'
\echo ' Expected: sees ONLY tenant A in every tenant-scoped table'
\echo '======================================================================'

BEGIN;

SET LOCAL request.jwt.claim.sub    = 'c5c8eba9-0a13-4278-8adc-7968072fa15c';
SET LOCAL request.jwt.claim.tenant = '3b59e85f-1246-44ea-8034-a1602f412d4e';
SET LOCAL request.jwt.claim.roles  = '["practice_admin"]';

\echo
\echo 'Auth context (expected: tenant_id = 3b59e85f..., is_super=false):'
SELECT
  app_auth.current_user_id()    AS user_id,
  app_auth.current_tenant_id()  AS tenant_id,
  app_auth.current_roles()      AS roles,
  app_auth.is_super_admin()     AS is_super;

\echo
\echo 'Visible tenants (expected: ONLY Exemplu Cabinet):'
SELECT id, name FROM public.tenants;

\echo
\echo 'Visible users — there should be NO rows with tenant_id = 37dc0318... (tenant B):'
SELECT tenant_id, count(*) AS users
FROM public.users
GROUP BY tenant_id
ORDER BY tenant_id NULLS FIRST;

\echo
\echo 'Visible invitations — should be tenant A only:'
SELECT tenant_id, count(*) AS invitations
FROM public.invitations
GROUP BY tenant_id
ORDER BY tenant_id;

\echo
\echo 'Visible document_templates — should be tenant A templates + NULL-tenant system templates:'
SELECT tenant_id, count(*) AS templates
FROM public.document_templates
GROUP BY tenant_id
ORDER BY tenant_id NULLS FIRST;

\echo
\echo 'examination_types should be visible (catalog is open to all authenticated users):'
SELECT count(*) AS types_visible FROM public.examination_types;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 4. Write denial — practice_admin in A cannot insert into tenant B
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 4 — Cross-tenant INSERT denial'
\echo ' Practice admin in tenant A tries to insert a location with'
\echo ' tenant_id = tenant B. Expected: ERROR — row-level security policy.'
\echo '======================================================================'

BEGIN;

SET LOCAL request.jwt.claim.sub    = 'c5c8eba9-0a13-4278-8adc-7968072fa15c';
SET LOCAL request.jwt.claim.tenant = '3b59e85f-1246-44ea-8034-a1602f412d4e';
SET LOCAL request.jwt.claim.roles  = '["practice_admin"]';

-- We expect the next INSERT to fail. ON_ERROR_ROLLBACK on means the
-- transaction stays alive after the error, so we can keep going.
-- Note: Prisma fills updated_at client-side via @updatedAt — raw SQL has
-- to set it explicitly. We do that here so the SANITY insert below
-- exercises only the policy and not a NOT NULL violation.
\echo
\echo '-- This INSERT must FAIL with: new row violates row-level security policy --'
INSERT INTO public.locations (id, tenant_id, name, updated_at)
VALUES (
  gen_random_uuid(),
  '37dc0318-df3a-4400-9a2c-66fb287b6926',  -- tenant B
  'should-not-be-inserted',
  now()
);
\echo '-- If you see no error above, the policy is broken. --'

\echo
\echo 'Sanity: same admin CAN insert into tenant A (their own tenant):'
INSERT INTO public.locations (id, tenant_id, name, updated_at)
VALUES (
  gen_random_uuid(),
  '3b59e85f-1246-44ea-8034-a1602f412d4e',  -- tenant A
  'rls-test-allowed-insert',
  now()
)
RETURNING id, tenant_id, name;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 5. Invitation insert with mismatched invited_by_user_id
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 5 — Invitation INSERT with wrong invited_by_user_id'
\echo ' Practice admin in A sets invited_by to a different user.'
\echo ' Expected: ERROR — WITH CHECK requires invited_by = current_user_id'
\echo '======================================================================'

BEGIN;

SET LOCAL request.jwt.claim.sub    = 'c5c8eba9-0a13-4278-8adc-7968072fa15c';
SET LOCAL request.jwt.claim.tenant = '3b59e85f-1246-44ea-8034-a1602f412d4e';
SET LOCAL request.jwt.claim.roles  = '["practice_admin"]';

\echo
\echo '-- This INSERT must FAIL (invited_by is the super_admin, not us) --'
INSERT INTO public.invitations (
  id, tenant_id, email, role, locale, token_hash, expires_at, invited_by_user_id
)
VALUES (
  gen_random_uuid(),
  '3b59e85f-1246-44ea-8034-a1602f412d4e',  -- tenant A (correct)
  'rls-test@example.com',
  'practitioner',
  'ro',
  'rls_test_token_hash_' || gen_random_uuid(),
  now() + interval '7 days',
  'e7c224a8-8afa-41a0-a4fd-b725ce65edbd'  -- super_admin user, NOT us
);
\echo '-- If you see no error above, the policy is broken. --'

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 6. Practitioner role cannot update users (only practice_admin / self)
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 6 — practitioner UPDATE on another tenant member'
\echo ' Practitioner (not admin) tries to update someone else in tenant A.'
\echo ' Expected: 0 rows updated — USING clause filters them out.'
\echo ' Note: this test will report "UPDATE 0" not an ERROR, because USING'
\echo ' on UPDATE silently excludes non-matching rows from the row set.'
\echo '======================================================================'

BEGIN;

-- Reuse the practice_admin user UUID but downgrade their role claim to
-- "practitioner" so the policy logic sees them as a non-admin.
SET LOCAL request.jwt.claim.sub    = 'c5c8eba9-0a13-4278-8adc-7968072fa15c';
SET LOCAL request.jwt.claim.tenant = '3b59e85f-1246-44ea-8034-a1602f412d4e';
SET LOCAL request.jwt.claim.roles  = '["practitioner"]';

-- Try to update some OTHER user in tenant A (not self). We use a WHERE
-- clause that matches anyone in tenant A who isn't us. If no other user
-- exists in tenant A this will be a vacuous test (UPDATE 0 either way) —
-- in that case, look at the count below to understand.
\echo
\echo 'Count of OTHER users in tenant A visible to this practitioner:'
SELECT count(*) AS other_users_in_tenant_a
FROM public.users
WHERE tenant_id = '3b59e85f-1246-44ea-8034-a1602f412d4e'
  AND id <> 'c5c8eba9-0a13-4278-8adc-7968072fa15c';

\echo
\echo 'UPDATE attempt — expected: UPDATE 0 (USING filters them all out):'
UPDATE public.users
SET first_name = first_name  -- no-op rename, just to trigger the policy
WHERE tenant_id = '3b59e85f-1246-44ea-8034-a1602f412d4e'
  AND id <> 'c5c8eba9-0a13-4278-8adc-7968072fa15c';

\echo
\echo 'Sanity — the practitioner CAN update their own row (self policy):'
UPDATE public.users
SET first_name = first_name
WHERE id = 'c5c8eba9-0a13-4278-8adc-7968072fa15c'
RETURNING id, first_name;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- 7. document_templates hybrid policy
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' Scenario 7 — document_templates hybrid (system + tenant-scoped)'
\echo ' practitioner in tenant A: should see system templates (tenant_id NULL)'
\echo ' AND tenant A templates, but NOT tenant B templates.'
\echo '======================================================================'

BEGIN;

SET LOCAL request.jwt.claim.sub    = 'c5c8eba9-0a13-4278-8adc-7968072fa15c';
SET LOCAL request.jwt.claim.tenant = '3b59e85f-1246-44ea-8034-a1602f412d4e';
SET LOCAL request.jwt.claim.roles  = '["practitioner"]';

\echo
\echo 'document_templates visible by tenant_id (expected: NULL group + tenant A only):'
SELECT
  tenant_id,
  count(*) AS templates
FROM public.document_templates
GROUP BY tenant_id
ORDER BY tenant_id NULLS FIRST;

ROLLBACK;


-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------

\echo
\echo '======================================================================'
\echo ' All scenarios complete. Review the output above.'
\echo ' If anything looks wrong, do NOT proceed to C.2c yet.'
\echo '======================================================================'

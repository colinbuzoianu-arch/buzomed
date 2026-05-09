-- =============================================================================
-- Phase C.1 — RLS foundation: role + helper functions
--
-- This migration is intentionally NON-DISRUPTIVE. After applying it:
--   - A new Postgres role `buzomed_app` exists with grants on all tables
--   - Helper functions exist in the `app_auth` schema for reading auth context
--   - RLS is NOT enabled on any table yet
--   - Prisma keeps connecting as the superuser via DATABASE_URL
--   - Everything works exactly as before
--
-- C.2 will enable RLS table-by-table with policies, and C.3 will switch
-- Prisma to the buzomed_app role.
--
-- Why a separate role: Postgres only enforces RLS for non-superusers and
-- non-table-owners. To make RLS actually do anything, Prisma must connect
-- as a role that does NOT bypass RLS. That role is `buzomed_app`.
--
-- Why helper functions: policies need to read "who is the current user"
-- and "what tenant do they belong to". We use Postgres's GUC mechanism
-- (`set_config('request.jwt.claim.*', ...)` per request) and wrap the
-- reads in functions for readability and indexability.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Create the buzomed_app role
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'buzomed_app') THEN
    -- The password is a placeholder — DO NOT rely on this. The real
    -- password must be set out-of-band by the DBA (you), via:
    --   ALTER ROLE buzomed_app PASSWORD '...strong-random...';
    -- The reason we don't put a real password here:
    --   1. Migrations are committed to git; passwords must not be
    --   2. Each environment (dev/staging/prod) needs its own password
    -- See post-migration steps in the README.
    CREATE ROLE buzomed_app
      WITH LOGIN
           NOSUPERUSER
           NOCREATEDB
           NOCREATEROLE
           NOREPLICATION
           PASSWORD 'replace_me_immediately_after_migration';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Grants on existing schema
--
-- buzomed_app needs:
--   - USAGE on the public schema
--   - SELECT/INSERT/UPDATE/DELETE on every existing table
--   - USAGE on every sequence (for serial/uuid defaults)
--   - EXECUTE on relevant functions
--
-- The `ALTER DEFAULT PRIVILEGES` lines ensure future tables (created by
-- subsequent migrations) automatically grant to buzomed_app, so we don't
-- need to remember to grant manually each migration.
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO buzomed_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO buzomed_app;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO buzomed_app;

GRANT EXECUTE
  ON ALL FUNCTIONS IN SCHEMA public
  TO buzomed_app;

-- Default privileges for objects created in the future by the migration
-- runner (which is the postgres superuser).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO buzomed_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO buzomed_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO buzomed_app;


-- -----------------------------------------------------------------------------
-- 3. The app_auth schema and helper functions
--
-- These functions read GUC settings that the application sets at the
-- beginning of each request:
--
--   SET LOCAL request.jwt.claim.sub      = '<user-uuid>';
--   SET LOCAL request.jwt.claim.tenant   = '<tenant-uuid>';
--   SET LOCAL request.jwt.claim.roles    = '["practitioner","practice_admin"]';
--
-- The functions are SECURITY DEFINER so they can be called from policies
-- regardless of the calling role's permissions. They are STABLE so the
-- planner can cache results within a single statement.
--
-- All return NULL if the corresponding GUC is unset, which lets policies
-- distinguish "unauthenticated" (NULL) from "authenticated" (non-NULL)
-- cleanly.
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app_auth;

GRANT USAGE ON SCHEMA app_auth TO buzomed_app;


-- Returns the current user's app User UUID, or NULL if not set.
CREATE OR REPLACE FUNCTION app_auth.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('request.jwt.claim.sub', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  -- Validate UUID format; if invalid, return NULL rather than raising.
  -- (A bad value should not crash a query; it should just leak no rows.)
  BEGIN
    RETURN raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END $$;


-- Returns the current user's tenant UUID, or NULL.
-- For super_admin (which has no tenant), this will be NULL — but
-- super_admin policies bypass tenant checks via app_auth.is_super_admin().
CREATE OR REPLACE FUNCTION app_auth.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('request.jwt.claim.tenant', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END $$;


-- Returns the current user's roles as a text[].
-- Empty array if no roles or no setting.
-- Stored as a JSON array in the GUC because GUCs are scalar text.
CREATE OR REPLACE FUNCTION app_auth.current_roles()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('request.jwt.claim.roles', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN ARRAY[]::text[];
  END IF;
  BEGIN
    -- Parse JSON array of strings and convert to text[]
    RETURN ARRAY(SELECT jsonb_array_elements_text(raw::jsonb));
  EXCEPTION WHEN OTHERS THEN
    RETURN ARRAY[]::text[];
  END;
END $$;


-- Convenience: does the current user have a given role?
CREATE OR REPLACE FUNCTION app_auth.has_role(role_to_check text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT role_to_check = ANY(app_auth.current_roles())
$$;


-- Convenience: is the current user a super_admin?
-- Used in nearly every policy as a bypass check.
CREATE OR REPLACE FUNCTION app_auth.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT 'super_admin' = ANY(app_auth.current_roles())
$$;


-- Grant execute on all helper functions to the app role.
GRANT EXECUTE ON FUNCTION app_auth.current_user_id() TO buzomed_app;
GRANT EXECUTE ON FUNCTION app_auth.current_tenant_id() TO buzomed_app;
GRANT EXECUTE ON FUNCTION app_auth.current_roles() TO buzomed_app;
GRANT EXECUTE ON FUNCTION app_auth.has_role(text) TO buzomed_app;
GRANT EXECUTE ON FUNCTION app_auth.is_super_admin() TO buzomed_app;


-- -----------------------------------------------------------------------------
-- 4. Documentation comments
-- Help future maintainers (or future-you) understand what this is.
-- -----------------------------------------------------------------------------

COMMENT ON ROLE buzomed_app IS
  'Application role. Connects via DATABASE_URL once Phase C.3 is deployed. '
  'Subject to RLS policies. Should never have CREATEDB/CREATEROLE/SUPERUSER.';

COMMENT ON SCHEMA app_auth IS
  'Helper functions for reading per-request auth context from GUCs. '
  'Used by RLS policies to determine the current user, tenant, and roles.';

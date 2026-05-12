-- Buzomed session 8 — CNP encryption foundation.
--
-- Adds the per-tenant CNP hash salt column. The salt itself is generated
-- at tenant creation time by application code and encrypted with the
-- project-wide CNP_ENCRYPTION_KEY before being written here.
--
-- Why nullable: existing tenants (from before this migration) won't have
-- a salt. Application code lazily generates one on first need (any code
-- path that tries to hash a CNP). See lib/crypto/cnp-hash.ts for the
-- format expected here.
--
-- Existing employees have null cnp_encrypted + cnp_hash already; nothing
-- to backfill.
--
-- pgcrypto: not strictly required by this migration (encryption happens
-- in Node), but we ensure the extension is present anyway because
-- subsequent sessions (RLS reactivation, server-side decryption helpers)
-- may rely on it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cnp_hash_salt TEXT;

COMMENT ON COLUMN tenants.cnp_hash_salt IS
  'Per-tenant HMAC salt for employees.cnp_hash. Encrypted at rest with the project CNP_ENCRYPTION_KEY. Generated at tenant create time.';

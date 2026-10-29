-- HR portal Phase 1 (signed fișe de aptitudine download).
--
-- `users.last_seen_fise_at` — when an HR user last opened the fișe list, used
-- to badge newly published fișe. Nullable: pre-existing users have never
-- visited the list.
--
-- `companies.publish_fise_to_hr_portal` — per-company switch controlling
-- whether signed fișe are exposed to that company's HR users. Defaults to
-- true so existing companies keep publishing without a manual opt-in.
--
-- Additive and backward-compatible. These columns were first applied by hand
-- on the Supabase instance; this migration records that same DDL in history so
-- a fresh database (or `migrate deploy`) reproduces it identically.

ALTER TABLE "users"     ADD COLUMN "last_seen_fise_at"         TIMESTAMPTZ;
ALTER TABLE "companies" ADD COLUMN "publish_fise_to_hr_portal" BOOLEAN NOT NULL DEFAULT true;

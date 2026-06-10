-- Add privacy_accepted_at, dpa_accepted_at, dpa_accepted_by to users table.
-- These fields record documented consent to Privacy Policy and DPA (Art. 28 GDPR)
-- at invite acceptance time, alongside the existing terms_accepted_at / terms_version.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dpa_accepted_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dpa_accepted_by"     TEXT;

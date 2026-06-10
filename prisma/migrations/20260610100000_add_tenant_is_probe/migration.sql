-- Add is_probe flag to tenants table.
-- Probe tenants are blank Solo/comp accounts used for sales demos;
-- they must not receive the trial welcome (plan-selection) email.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "is_probe" BOOLEAN NOT NULL DEFAULT false;

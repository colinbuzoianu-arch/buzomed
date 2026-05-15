-- Session 14: add isDemo flag to tenants
-- Marks tenants created as demo environments so the super-admin can
-- filter/identify them and the seed endpoint can target them.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Index for quick filtering of demo vs real tenants
CREATE INDEX IF NOT EXISTS tenants_is_demo_idx ON tenants (is_demo);

-- Employee import UPDATE path (prompt-import-update.md).
--
-- When an import re-matches an existing employee and the operator chose
-- "Actualizează angajații existenți cu datele din fișier", the employee is
-- updated in place instead of being skipped. Track how many rows that
-- affected, next to created/skipped/failed.
--
-- Additive and backward-compatible: the new column has a default so existing
-- rows (which predate the feature) read back as 0.

ALTER TABLE "import_jobs" ADD COLUMN "updated" INTEGER NOT NULL DEFAULT 0;

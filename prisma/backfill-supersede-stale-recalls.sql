-- Buzomed — backfill: close STALE recalls that a later examination fulfilled.
--
-- Bug: a recall (periodic control) created by an examination was only closed
-- when the follow-up was scheduled FROM the scadențe list. If the follow-up
-- examination was created directly (via /examinations/new) and signed, the
-- previous examination's recall was never closed and stayed `overdue` on the
-- dashboard forever — even though the worker had been re-examined.
--
-- The code fix (lib/recalls/upsert-from-examination.ts → supersedePriorRecalls)
-- prevents NEW stale recalls from here on, and closes prior recalls on the next
-- sign. This script cleans up recalls that already went stale in the database
-- (the ones the client is seeing right now).
--
-- A recall is considered STALE when a DIFFERENT, signed examination exists for
-- the same (tenant, employee, workplace) whose schedule overtakes the recall's
-- due date — i.e. the exact same rule as isSupersededByExamination():
--     COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
--
-- Idempotent: only touches status IN ('pending','overdue'); re-running is safe.
--
-- PRECAUTIONS — run in this order, reviewing each step before the next:
--   0. Take/confirm a DB backup (Supabase: Database → Backups).
--   1. Find the target tenant id (STEP 0 below) and paste it into :tenant_id.
--   2. Run STEP 1 (counts) and STEP 2 (sample) — READ ONLY. Sanity-check them.
--   3. Only then run STEP 3 (the UPDATE), ideally inside BEGIN; … COMMIT;.
--   4. Run STEP 4 to verify the remaining overdue count dropped as expected.
--
-- Usage: Supabase Dashboard → SQL Editor → paste one step at a time → Run.
--        (or: psql "$DIRECT_URL" and run interactively)
--
-- Scope: every step is filtered to a single tenant via the :tenant_id below.
--        Set it once. To run across ALL tenants, remove the tenant_id lines
--        (NOT recommended for the first run).

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 0 — find the tenant id (e.g. Sana Company SRL). READ ONLY.
--   SELECT id, name FROM tenants WHERE name ILIKE '%sana%' AND deleted_at IS NULL;
-- Copy the id and substitute it everywhere below in place of
--   '00000000-0000-0000-0000-000000000000'.
-- ───────────────────────────────────────────────────────────────────────────

-- A reusable view of the stale recalls + the examination that fulfilled each.
-- (Defined inline in each step so steps are independently runnable.)

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 1 — how many recalls would be closed? READ ONLY.
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*) AS stale_recalls_to_close
FROM recalls r
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND r.status IN ('pending', 'overdue')
  AND r.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM examinations e
    WHERE e.tenant_id = r.tenant_id
      AND e.employee_id = r.employee_id
      AND e.workplace_id = r.workplace_id
      AND e.deleted_at IS NULL
      AND e.signed_at IS NOT NULL
      AND (r.created_from_examination_id IS NULL OR e.id <> r.created_from_examination_id)
      AND COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
  );

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 2 — inspect a sample before writing. READ ONLY.
-- Shows the recall, the employee, the recall's due date, and the examination
-- that will be recorded as having fulfilled it.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  r.id                                    AS recall_id,
  r.status                                AS recall_status,
  r.due_date                              AS recall_due_date,
  emp.last_name || ' ' || emp.first_name  AS employee,
  fulfilling.id                           AS fulfilling_exam_id,
  fulfilling.examination_number           AS fulfilling_exam_number,
  fulfilling.signed_at                    AS fulfilling_signed_at,
  fulfilling.next_examination_due_date    AS fulfilling_next_due
FROM recalls r
JOIN employees emp ON emp.id = r.employee_id
JOIN LATERAL (
  SELECT e.id, e.examination_number, e.signed_at, e.next_examination_due_date
  FROM examinations e
  WHERE e.tenant_id = r.tenant_id
    AND e.employee_id = r.employee_id
    AND e.workplace_id = r.workplace_id
    AND e.deleted_at IS NULL
    AND e.signed_at IS NOT NULL
    AND (r.created_from_examination_id IS NULL OR e.id <> r.created_from_examination_id)
    AND COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
  ORDER BY e.signed_at DESC
  LIMIT 1
) fulfilling ON true
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND r.status IN ('pending', 'overdue')
  AND r.deleted_at IS NULL
ORDER BY r.due_date
LIMIT 50;

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3 — THE WRITE. Closes the stale recalls, pointing each at the most
-- recent examination that fulfilled it. Wrap in a transaction so you can
-- inspect the row count and ROLLBACK if it looks wrong.
--
--   BEGIN;
--   <run the UPDATE below>
--   -- check the reported row count matches STEP 1
--   COMMIT;   -- or ROLLBACK;
-- ───────────────────────────────────────────────────────────────────────────
UPDATE recalls r
SET status = 'completed',
    completed_examination_id = fulfilling.id,
    updated_at = now()
FROM LATERAL (
  SELECT e.id
  FROM examinations e
  WHERE e.tenant_id = r.tenant_id
    AND e.employee_id = r.employee_id
    AND e.workplace_id = r.workplace_id
    AND e.deleted_at IS NULL
    AND e.signed_at IS NOT NULL
    AND (r.created_from_examination_id IS NULL OR e.id <> r.created_from_examination_id)
    AND COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
  ORDER BY e.signed_at DESC
  LIMIT 1
) fulfilling
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000000'
  AND r.status IN ('pending', 'overdue')
  AND r.deleted_at IS NULL;
-- NOTE: Postgres does not allow a bare LATERAL in UPDATE ... FROM on every
-- version in the same way; if your version rejects the LATERAL form above,
-- use the subquery form in STEP 3b instead (equivalent result).

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 3b — equivalent UPDATE without LATERAL (use if STEP 3 errors).
-- ───────────────────────────────────────────────────────────────────────────
-- UPDATE recalls r
-- SET status = 'completed',
--     completed_examination_id = (
--       SELECT e.id FROM examinations e
--       WHERE e.tenant_id = r.tenant_id
--         AND e.employee_id = r.employee_id
--         AND e.workplace_id = r.workplace_id
--         AND e.deleted_at IS NULL
--         AND e.signed_at IS NOT NULL
--         AND (r.created_from_examination_id IS NULL OR e.id <> r.created_from_examination_id)
--         AND COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
--       ORDER BY e.signed_at DESC
--       LIMIT 1
--     ),
--     updated_at = now()
-- WHERE r.tenant_id = '00000000-0000-0000-0000-000000000000'
--   AND r.status IN ('pending', 'overdue')
--   AND r.deleted_at IS NULL
--   AND EXISTS (
--     SELECT 1 FROM examinations e
--     WHERE e.tenant_id = r.tenant_id
--       AND e.employee_id = r.employee_id
--       AND e.workplace_id = r.workplace_id
--       AND e.deleted_at IS NULL
--       AND e.signed_at IS NOT NULL
--       AND (r.created_from_examination_id IS NULL OR e.id <> r.created_from_examination_id)
--       AND COALESCE(e.next_examination_due_date, e.signed_at::date) > r.due_date
--   );

-- ───────────────────────────────────────────────────────────────────────────
-- STEP 4 — verify. READ ONLY. The overdue count should have dropped by the
-- number STEP 1 reported.
-- ───────────────────────────────────────────────────────────────────────────
SELECT status, count(*)
FROM recalls
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;

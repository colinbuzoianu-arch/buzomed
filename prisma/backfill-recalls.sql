-- Buzomed session 9 — Recall backfill.
--
-- Session 6 populated examinations.next_examination_due_date on sign but
-- did NOT create corresponding rows in the recalls table. Session 9
-- introduces the recall dashboard, which reads from recalls. This SQL
-- creates a Recall row for every signed examination that should have
-- one (verdict in apt/apt_conditionat, has a due date) and doesn't yet.
--
-- Idempotent: NOT EXISTS guards mean re-running is safe. Skips any
-- examination already linked to a non-deleted Recall.
--
-- One small twist: there's no @@unique constraint on
-- (createdFromExaminationId), so we enforce uniqueness in the WHERE
-- clause rather than relying on ON CONFLICT.
--
-- Usage:
--   psql "$DIRECT_URL" -f prisma/backfill-recalls.sql
--   OR Supabase Dashboard → SQL Editor → paste → Run
--
-- Verify after running:
--   SELECT count(*) FROM recalls WHERE status = 'pending';
--   SELECT count(*) FROM examinations
--     WHERE signed_at IS NOT NULL
--       AND next_examination_due_date IS NOT NULL
--       AND verdict IN ('apt', 'apt_conditionat')
--       AND deleted_at IS NULL;
-- The two counts should match (give or take any inapt verdicts).

INSERT INTO recalls (
  id,
  tenant_id,
  employee_id,
  workplace_id,
  examination_type_id,
  due_date,
  created_from_examination_id,
  status,
  notification_count,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  e.tenant_id,
  e.employee_id,
  e.workplace_id,
  e.examination_type_id,
  e.next_examination_due_date,
  e.id,
  'pending',
  0,
  NOW(),
  NOW()
FROM examinations e
WHERE
  e.signed_at IS NOT NULL
  AND e.next_examination_due_date IS NOT NULL
  AND e.verdict IN ('apt', 'apt_conditionat')
  AND e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM recalls r
    WHERE r.created_from_examination_id = e.id
      AND r.deleted_at IS NULL
  );

-- Mark any pending recall whose due date has already passed as overdue.
-- This makes the dashboard's "overdue" tab populate with real data on
-- first load. Going forward, we update status lazily on read rather than
-- running a daily cron (see lib/recalls — overdue is a computed property
-- from `dueDate < today AND status = 'pending'`, but having it stored
-- also lets the @@index([status]) be useful for fast counts).
UPDATE recalls
   SET status = 'overdue', updated_at = NOW()
 WHERE status = 'pending'
   AND due_date < CURRENT_DATE
   AND deleted_at IS NULL;

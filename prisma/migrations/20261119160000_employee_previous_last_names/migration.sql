-- Capture former surnames so a person can be found by a name they no longer
-- use (e.g. after marriage/divorce), and so older documents stay easy to
-- connect to the right employee. Backfills every existing row with an empty
-- array; nothing is lost and no existing data is touched.
ALTER TABLE "employees"
  ADD COLUMN "previous_last_names" TEXT[] NOT NULL DEFAULT '{}';

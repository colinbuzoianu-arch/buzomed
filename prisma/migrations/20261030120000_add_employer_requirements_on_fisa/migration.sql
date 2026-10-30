-- The employer-requirements text the doctor chose to PRINT on the fișă de
-- aptitudine. Kept SEPARATE from the doctor's recommendations /
-- verdictConditions: the printed free-text is composed at render time as
-- "{employer_requirements_on_fisa}. {verdictConditions ?? recommendations}"
-- (see lib/examinations/compose-fisa-recommendations.ts). This replaces the
-- earlier approach of appending into the doctor's free-text field.
--
-- ADDITIVE ONLY. One new nullable TEXT column, no data touched. NULL on every
-- existing (incl. already-signed) examination, so their fișe print exactly as
-- before. The examinations table already has RLS enabled with tenant policies
-- (20260510065838_rls_policies), so no policy change is needed.

ALTER TABLE "examinations" ADD COLUMN "employer_requirements_on_fisa" TEXT;

-- Employer requirements ("Cerințe angajator") — the conditions an employer
-- asks the fitness certificate (fișa de aptitudine) to cover, e.g.
-- "MUNCA IN TURE DE NOAPTE", "CU ATRIBUTII COND. AUTO CAT B". This is the
-- EMPLOYER's request, NOT medical data and NOT a verdict. The doctor sees it
-- during the exam and copies it onto the fișă manually — nothing is ever
-- pre-filled or auto-inserted.
--
-- ADDITIVE ONLY. Two new nullable TEXT columns, no data touched:
--   * employees.employer_requirements            — the current request
--   * examinations.employer_requirements_snapshot — what it was at exam time
-- Both default to NULL, so every existing row is unchanged and reads back as
-- "no requirements" (no box shown, nothing printed).
--
-- RLS: both tables already have RLS enabled with tenant policies
-- (20260510065838_rls_policies); adding a column needs no policy change.

ALTER TABLE "employees"    ADD COLUMN "employer_requirements"          TEXT;
ALTER TABLE "examinations" ADD COLUMN "employer_requirements_snapshot" TEXT;

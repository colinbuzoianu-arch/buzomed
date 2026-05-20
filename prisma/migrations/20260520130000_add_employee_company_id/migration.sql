ALTER TABLE "employees" ADD COLUMN "company_id" UUID REFERENCES "companies"("id");
CREATE INDEX "employees_company_id_idx" ON "employees"("company_id");

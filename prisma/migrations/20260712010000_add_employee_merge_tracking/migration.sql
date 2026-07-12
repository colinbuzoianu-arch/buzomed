-- AlterTable: employees — self-referencing FK for duplicate-merge tracking
ALTER TABLE "employees" ADD COLUMN "merged_into_id" UUID;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

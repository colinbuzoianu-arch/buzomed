-- CreateEnum
CREATE TYPE "DisabilityDegree" AS ENUM ('usor', 'mediu', 'accentuat', 'grav');

-- AlterTable: employees — nullable, absence means "not confirmed/not set"
ALTER TABLE "employees" ADD COLUMN "disability_degree" "DisabilityDegree";

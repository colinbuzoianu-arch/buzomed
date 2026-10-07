-- Session: fișă revocation (retragere) + real examination date.
--
-- Two independent additions to "examinations":
--
--   1. examined_at — the date the consultation physically happened, as
--      distinct from created_at (row inserted) and signed_at (document
--      signed). Previously the fișă printed signed_at/completed_at as the
--      "examination date", so an exam held on the 3rd but entered and
--      signed on the 10th printed the 10th. Nullable: existing rows keep
--      falling back to completed_at/created_at, same as before.
--
--   2. revocation columns — a signed fișă is immutable by design (it is a
--      legal document the worker may already have handed to their
--      employer), so a wrong verdict cannot be edited away. What was
--      missing is a traceable withdrawal: mark the old fișă as retrasă,
--      with reason, who, when, and optionally the examination that
--      replaces it. superseded_by_examination_id is a self-FK.

-- AlterTable: real consultation date
ALTER TABLE "examinations" ADD COLUMN "examined_at" TIMESTAMPTZ;

-- AlterTable: revocation
ALTER TABLE "examinations" ADD COLUMN "revoked_at" TIMESTAMPTZ;
ALTER TABLE "examinations" ADD COLUMN "revoked_by_user_id" UUID;
ALTER TABLE "examinations" ADD COLUMN "revocation_reason" TEXT;
ALTER TABLE "examinations" ADD COLUMN "superseded_by_examination_id" UUID;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_superseded_by_examination_id_fkey" FOREIGN KEY ("superseded_by_examination_id") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: revoked fișe are queried tenant-scoped (compliance review,
-- "ce fișe au fost retrase"), and the partial-ish composite keeps the
-- common revoked_at IS NULL case cheap.
CREATE INDEX "examinations_tenant_id_revoked_at_idx" ON "examinations"("tenant_id", "revoked_at");

-- Audit trail gets its own action value so revocations are filterable
-- rather than hidden inside generic 'update' rows.
-- Safe inside Prisma's migration transaction on PG 12+: the new value is
-- added but not used in this same transaction.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'revoke';

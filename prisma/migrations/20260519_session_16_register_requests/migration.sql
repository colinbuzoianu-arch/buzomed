-- CreateTable: register_requests
-- Self-service registration submissions from the public /register page.
-- Status transitions: pending → (approved | rejected) by super_admin.
-- tenant_id is set when the tenant is auto-created on submission.

CREATE TABLE "register_requests" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "name"         TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "cabinet_name" TEXT NOT NULL,
    "city"         TEXT,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "tenant_id"    UUID,

    CONSTRAINT "register_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "register_requests_email_idx"      ON "register_requests"("email");
CREATE INDEX "register_requests_status_idx"     ON "register_requests"("status");
CREATE INDEX "register_requests_created_at_idx" ON "register_requests"("created_at");

-- RLS: only service role can access this table (no public reads)
ALTER TABLE "register_requests" ENABLE ROW LEVEL SECURITY;

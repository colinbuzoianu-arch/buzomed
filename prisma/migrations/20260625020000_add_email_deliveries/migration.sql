CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" UUID,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "success" BOOLEAN NOT NULL,
    "message_id" TEXT,
    "error_message" TEXT,
    "had_attachment" BOOLEAN NOT NULL DEFAULT false,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_deliveries_tenant_id_attempted_at_idx" ON "email_deliveries"("tenant_id", "attempted_at");
CREATE INDEX "email_deliveries_success_attempted_at_idx" ON "email_deliveries"("success", "attempted_at");
CREATE INDEX "email_deliveries_attempted_at_idx" ON "email_deliveries"("attempted_at");

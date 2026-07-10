-- Trial reminder consolidation (send-once flag), GDPR unsubscribe suppression
-- list, and payment/invoice lifecycle email tracking fields.

-- AlterTable: subscriptions — send-once flag for the consolidated trial reminder
ALTER TABLE "subscriptions"
    ADD COLUMN     "trial_reminder_sent_at" TIMESTAMPTZ;

-- AlterTable: platform_invoices — due-soon / overdue reminder tracking
ALTER TABLE "platform_invoices"
    ADD COLUMN     "due_soon_reminder_sent_at" TIMESTAMPTZ,
    ADD COLUMN     "overdue_reminder_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN     "last_overdue_reminder_at" TIMESTAMPTZ;

-- CreateTable: email_suppressions
-- GDPR unsubscribe list. Not a field on users — recipients of invoice/trial
-- emails may not have a User row (billing email only).
CREATE TABLE "email_suppressions" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "email"         TEXT        NOT NULL,
    "reason"        TEXT,
    "suppressed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions" ("email");

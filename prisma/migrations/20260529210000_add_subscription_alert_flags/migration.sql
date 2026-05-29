ALTER TABLE "subscriptions"
  ADD COLUMN "enterprise_alert_sent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "past_due_alert_sent"   BOOLEAN NOT NULL DEFAULT false;

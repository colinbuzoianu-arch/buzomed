-- CreateTable: processed_stripe_events
-- Idempotency table for Stripe webhook deduplication.
-- Stripe retries webhooks aggressively; the PK on event_id makes the second
-- delivery a unique-violation (P2002) which the handler maps to a 200 no-op.
-- The index on processed_at supports a future cleanup job that deletes rows
-- older than 60 days (Stripe's retry window).
CREATE TABLE "processed_stripe_events" (
    "event_id"     TEXT        NOT NULL,
    "event_type"   TEXT        NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "processed_stripe_events_processed_at_idx"
    ON "processed_stripe_events" ("processed_at");

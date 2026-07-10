-- Remove Stripe entirely, add manual flat + usage-based platform billing.
-- Confirmed with user: no Subscription rows have a non-null stripe_subscription_id
-- (no live Stripe subscriptions), so it is safe to drop these columns without a
-- data migration.

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('flat', 'usage');

-- AlterTable: subscriptions
ALTER TABLE "subscriptions"
    ADD COLUMN     "billing_mode" "BillingMode" NOT NULL DEFAULT 'flat',
    ADD COLUMN     "platform_price_per_exam" DECIMAL(10,2),
    DROP COLUMN    "stripe_customer_id",
    DROP COLUMN    "stripe_subscription_id";

-- AlterTable: plans — stripe reference fields are dead weight once Stripe is gone
ALTER TABLE "plans"
    DROP COLUMN    "stripe_product_id",
    DROP COLUMN    "stripe_price_id";

-- DropTable: was only for Stripe webhook idempotency
DROP TABLE "processed_stripe_events";

-- AlterTable: platform_invoices — dedup key for "Generează factură" (billingMode-aware)
ALTER TABLE "platform_invoices"
    ADD COLUMN     "billing_period" TEXT;

-- CreateIndex
-- Postgres treats NULLs as distinct in unique constraints, so manually created
-- invoices (billing_period IS NULL) never collide; only generated invoices for
-- the same tenant+month do.
CREATE UNIQUE INDEX "platform_invoices_tenant_id_billing_period_key"
    ON "platform_invoices" ("tenant_id", "billing_period");

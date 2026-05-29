-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "stripe_price_id" TEXT,
ADD COLUMN     "stripe_product_id" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "active_employee_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trial_extended_days" INTEGER NOT NULL DEFAULT 0;

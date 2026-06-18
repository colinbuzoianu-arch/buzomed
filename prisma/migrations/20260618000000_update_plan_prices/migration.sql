UPDATE "plans" SET "monthly_price" = 99  WHERE "tier" = 'starter';
UPDATE "plans" SET "monthly_price" = 299 WHERE "tier" = 'growth';
UPDATE "plans" SET "monthly_price" = 699 WHERE "tier" = 'pro';

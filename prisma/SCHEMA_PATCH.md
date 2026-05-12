# Schema patch for session 8

Add ONE field to the `Tenant` model in `prisma/schema.prisma`. Find the
`Tenant` model and add `cnpHashSalt` near the other PII-related fields
(or just before `featureFlags`):

```prisma
model Tenant {
  id                  String              @id @default(uuid()) @db.Uuid
  name                String
  // ... existing fields ...

  // Session 8: CNP encryption foundation.
  // Per-tenant HMAC salt for employees.cnpHash. Stored encrypted with the
  // project-wide CNP_ENCRYPTION_KEY. Generated at tenant creation; null
  // for tenants that existed before session 8 (lazily backfilled by app
  // code on first CNP write).
  cnpHashSalt         String?             @map("cnp_hash_salt")

  featureFlags        Json                @default("{}") @map("feature_flags")
  // ... rest unchanged ...
}
```

After editing the schema file, regenerate the Prisma client:

```bash
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate
```

The migration SQL has already been written to:
  `prisma/migrations/20260512_session_8_cnp_encryption/migration.sql`

Apply it with EITHER:
  (a) `npx prisma migrate deploy` (production)
  (b) `npx prisma migrate dev` (local; will mark this migration as applied
      without re-running if you already ran the SQL by hand)
  (c) Paste the SQL into Supabase Dashboard → SQL Editor → Run

Option (c) is what you did for session 7's storage bucket and works fine
here too — it's only one ALTER TABLE.

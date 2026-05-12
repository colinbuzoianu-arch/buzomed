# Buzomed — session 8: CNP encryption

Romanian CNP (national ID) capture goes live. Stored encrypted with
AES-256-GCM, indexed by per-tenant HMAC hash for dup-checking and
lookup, validated with full structural + checksum rules, displayed
masked-by-default with a reveal toggle for practitioners.

## What's in this bundle (16 files + README)

### New
- `lib/crypto/cnp-cipher.ts` — AES-256-GCM encrypt/decrypt
- `lib/crypto/cnp-hash.ts` — per-tenant HMAC-SHA-256 + salt management
- `lib/crypto/cnp-validation.ts` — structural + checksum validation, masking
- `lib/crypto/tenant-salt.ts` — lazy get-or-create-tenant-salt
- `prisma/SCHEMA_PATCH.md` — instructions for the one schema change
- `prisma/migrations/20260512_session_8_cnp_encryption/migration.sql` — adds `tenants.cnp_hash_salt`
- `app/(authenticated)/employees/[id]/cnp-reveal.tsx` — mask/reveal client component
- `scripts/merge-i18n-session-8.mjs` — adds CNP i18n keys, removes obsolete deferral keys

### Modified
- `lib/permissions/tenant-data.ts` — adds `canViewSensitivePii`
- `app/api/tenants/route.ts` — generates `cnpHashSalt` at tenant create time
- `app/api/employees/route.ts` — POST now accepts + validates + encrypts CNP
- `app/api/employees/[id]/route.ts` — GET returns decrypted CNP for authorized callers; PATCH handles all four CNP-change cases
- `app/(authenticated)/employees/employee-form.tsx` — CNP option in dropdown, special input handling, real-time birth-date warning
- `app/(authenticated)/employees/form-labels.ts` — wired new label keys, removed obsolete
- `app/(authenticated)/employees/[id]/edit/page.tsx` — decrypts + prefills CNP on edit
- `app/(authenticated)/employees/[id]/page.tsx` — CNP row with reveal toggle, idDocumentType label translation

## Prerequisites (do these FIRST)

### 1. Generate and set CNP_ENCRYPTION_KEY

Once. Pick a key, set it everywhere (Vercel + your local `.env.local`), and **never lose it**. Losing this key means every encrypted CNP becomes permanently unreadable.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output. Then:

**In Vercel** (production + preview environments):
```bash
vercel env add CNP_ENCRYPTION_KEY production
# paste the key when prompted
vercel env add CNP_ENCRYPTION_KEY preview
# paste the same key
```
Or via the Vercel dashboard → Project → Settings → Environment Variables.

**In your local `.env.local`**:
```
CNP_ENCRYPTION_KEY="<the-base64-key>"
```

### 2. Verify SUPABASE_SERVICE_ROLE_KEY is set

Already set from session 5/7. `vercel env ls` to confirm.

## Integration steps

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-8.zip

# 1. Apply the schema change. Open prisma/schema.prisma and follow
#    prisma/SCHEMA_PATCH.md — add ONE line to the Tenant model:
#      cnpHashSalt   String?   @map("cnp_hash_salt")

# 2. Regenerate the Prisma client
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# 3. Apply the migration. Pick ONE:
#    Option A — via Prisma:
npx prisma migrate deploy
#    Option B — Supabase Dashboard → SQL Editor → paste the migration.sql → Run
#    (this is what you did for sessions 7 storage bucket)

# 4. Merge i18n keys (adds 32 keys, removes 4 obsolete)
node scripts/merge-i18n-session-8.mjs

# 5. Type check + dev
rm -rf .next
npx tsc --noEmit
npm run dev

# 6. Commit + push
git add .
git commit -m "Session 8: CNP encryption (AES-256-GCM + per-tenant HMAC hash)"
git push
```

## Design decisions baked in

- **Q1 = (a)** — Single project-wide `CNP_ENCRYPTION_KEY` env var. Clean upgrade path to wrapped per-tenant keys later (the on-disk format leaves room).
- **Q2 = (b)** — AES-256-GCM in Node.js. The cipher's auth tag detects tampering; corrupted blobs throw rather than silently return wrong data.
- **Q3 = (b)** — HMAC-SHA-256 with per-tenant SECRET salt. The salt is generated at tenant create time, encrypted at rest with the same project key, and stored in `tenants.cnp_hash_salt`.
- **Q4 = (a)** — practice_admin + practitioner can decrypt; assistant cannot. The split happens in `canViewSensitivePii` — separate from `canWriteTenantData` so the audit log (session 10) can hook in cleanly later.
- **Q5 = (b)** — Masked by default (`185031*******`), Show/Hide toggle for authorized users. Toggle is UI-only — the plaintext is already in the client bundle when the server decided to send it.
- **Q6 = (a)** — No backfill. Test data uses `idDocumentType=passport`; no CNPs to migrate.
- **Q7 = (c)** — Full structural validation: 13 digits, gender/century code, valid month/day, county code in {1-46, 51, 52}, sequence ≥ 1, **checksum**. Birth date cross-check between CNP and explicit `birthDate` field is a UI warning, not a hard block.

## Threat model

**Protected against:**
- Database snapshot leak or read-only Postgres access: the `cnp_encrypted` column is opaque bytes, `cnp_hash` is non-reversible without the per-tenant secret salt
- Tampering with stored ciphertext: GCM auth tag fails the decrypt
- Rainbow-table attacks on CNP hashes: per-tenant secret salt makes them tenant-specific and expensive even with full knowledge of the algorithm

**NOT protected against:**
- Full application-host compromise (env vars + DB): the attacker has the key and can decrypt everything. This is the same model as every server-side-encrypted SaaS. Mitigation comes later via per-tenant wrapped keys (`CNP_ENCRYPTION_KEY` becomes a KEK, never used to encrypt records directly).
- Authorized insider abuse: a practice admin or practitioner can already see every CNP. Mitigation = session 10's audit log of PII-view events.

## Test plan

### Crypto setup
1. Set `CNP_ENCRYPTION_KEY` in Vercel + local `.env.local`
2. Restart `npm run dev` so the new env var loads

### New employee with CNP
3. Go to `/employees/new`, fill required fields
4. In "Tip document", select "CNP"
5. Enter a valid test CNP like `1800101010015` (M, born 1980-01-01)
6. Set birth date to anything OTHER than 1980-01-01 → see the amber warning
7. Set birth date to 1980-01-01 → warning disappears
8. Save → redirected to employee detail page

### CNP display
9. On the employee detail page, the ID document row shows "185031*******" (masked)
10. Click **Afișează** → full CNP appears, button switches to **Ascunde**
11. Click **Ascunde** → goes back to masked

### Validation
12. Try saving an invalid CNP (e.g., `1234567890123` — bad checksum) → form rejects with "CNP checksum doesn't match"
13. Try a 12-digit number → "CNP must be exactly 13 digits"

### Duplicate detection
14. Create employee A with CNP `1800101010015`
15. Try to create employee B with the same CNP → 409 with "Another employee with the same CNP already exists in this cabinet"

### Edit existing CNP employee
16. Click edit on the CNP-bearing employee
17. The CNP value is pre-filled in the input (because you're a practitioner)
18. Change to a different valid CNP → save → detail page now shows the new CNP

### Switch ID document type
19. Edit a CNP-bearing employee, change "Tip document" from CNP to "Pașaport"
20. Replace the CNP value with a passport number → save
21. Detail page now shows passport number as plain text; CNP is gone (encrypted column nulled)

### Permission check (assistant role)
22. Sign in as an assistant (if you have one set up, otherwise skip)
23. View a CNP-bearing employee → masked-only, no Show button, "(requires practitioner role)" hint

### Cross-tenant isolation
24. Create employee with CNP `1800101010015` in tenant A
25. In tenant B, try creating an employee with the same CNP → should succeed (different per-tenant hash)
26. Verify the per-tenant salt isolation by checking that the same CNP in tenant A vs tenant B produces different `cnp_hash` rows in the DB

### Database inspection (optional sanity check)
27. In Supabase Studio, open the `employees` table
28. The `cnp_encrypted` column shows base64 strings, not plaintext
29. The `cnp_hash` column shows base64 strings (44 chars each)
30. The `id_document_number` column is null for CNP-typed rows

## What's NOT in this session

- **Audit log of PII views** — `canViewSensitivePii` exists as a separate hook so session 10's audit log can plug in without refactoring call sites
- **Per-tenant wrapped keys** — single project-wide key for now; migration path documented
- **CNP search** — we have `cnp_hash` indexed, so "find an employee by CNP" is a future query. UI doesn't expose it yet
- **Recall dashboard** — uses the `nextExaminationDueDate` data populated in session 6 but UI is not built
- **Practitioner-level encryption** — User.cnpEncrypted/cnpHash also exist in schema (for tracking practitioners' own CNPs). Not surfaced in this session

## What changes if a Vercel deploy fails on this session

Most likely culprits:

1. **`CNP_ENCRYPTION_KEY` not set in Vercel** — uploads of new tenants will create with `cnpHashSalt=null`; employee CNP capture will 503 with `encryption_not_configured`. The app still functions for non-CNP document types.
2. **Schema not updated** — `prisma generate` errors about missing `cnpHashSalt` field. Apply `SCHEMA_PATCH.md` before regenerating.
3. **Migration not run** — runtime errors about column `cnp_hash_salt` not existing. Run migration via any of the three options.
4. **Key shape wrong** — if your base64 doesn't decode to exactly 32 bytes, the cipher throws at startup. Regenerate with the one-liner.

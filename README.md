# Buzomed — session 7: Documents (uploads, downloads, deletes)

Lets practitioners attach files (lab results, referrals, ID scans, prior
medical records, etc.) to examinations and employees. Files live in a
private Supabase Storage bucket; downloads happen via short-lived signed
URLs.

## What's in this bundle (13 files + README)

### New
- `prisma/setup-storage-bucket.sql` — creates the `documents` bucket
- `lib/supabase/admin.ts` — service-role Supabase client
- `lib/documents/upload-rules.ts` — MIME whitelist, size cap, filename sanitizer, storage path builder
- `app/api/documents/route.ts` — GET (list) + POST (multipart upload)
- `app/api/documents/[id]/route.ts` — GET / DELETE
- `app/api/documents/[id]/download/route.ts` — POST → returns short signed URL
- `app/(authenticated)/_components/documents-section.tsx` — server component shell
- `app/(authenticated)/_components/documents-list.tsx` — client interactivity (upload + download + delete)
- `scripts/merge-i18n-session-7.mjs` — adds the `documents.*` i18n namespace

### Modified
- `app/(authenticated)/examinations/[id]/page.tsx` — wires DocumentsSection
- `app/(authenticated)/employees/[id]/page.tsx` — wires DocumentsSection

Both modifications are tiny — one import + one component instance each.
They sit ON TOP of session 6's versions.

## Integration steps

From your local `Buzomed/` repo root:

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-7.zip

# 1. Apply the i18n merge (adds 58 keys total — 29 RO + 29 EN)
node scripts/merge-i18n-session-7.mjs

# 2. Regenerate Prisma client (no schema changes — but DocumentEntityType
#    etc. need to be re-exported if the local cache is stale)
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# 3. Create the Storage bucket — pick ONE of:
#    Option A — via psql:
psql "$DATABASE_URL" -f prisma/setup-storage-bucket.sql
#    Option B — Supabase Dashboard → SQL Editor → paste the file's contents → Run
#    Option C — Supabase Dashboard → Storage → New Bucket → Name: documents,
#               Public: off, File size limit: 15MB, Allowed MIME: pdf/jpeg/png/docx

# 4. Type check + dev
rm -rf .next
npx tsc --noEmit
npm run dev

# 5. Commit + push
git add .
git commit -m "Session 7: Documents (Supabase Storage upload/download)"
git push
```

## Design decisions baked in

- **Q1 = (a)** — Single private bucket `documents`, paths are
  `{tenantId}/{entityType}/{entityId}/{uuid}-{safeFilename}`. Tenant
  isolation enforced in route handlers, not bucket-level RLS.
- **Q2 = (c)** — 15 MB cap. Accepted MIMEs: PDF, JPEG, PNG, DOCX.
  Enforced both at the application layer (friendly errors) AND at the
  bucket level (`storage.buckets.allowed_mime_types`).
- **Q3 = (b)** — Signed URLs with 60-second TTL for downloads. No
  server-side proxy. `Content-Disposition: attachment` is set via the
  signed URL's `download` parameter.
- **Q4 = (c)** — UI surfaces documents on examination + employee
  detail pages. API also accepts `workplace`, `company` (handled at
  the entity-exists check) — drop the same component on those detail
  pages whenever we're ready. `vaccination` and `medical_event` will
  404 until sessions 9-10 build those entities.
- **Q5 = (c)** — Auto-generated PDFs (the signed fișa) deferred to
  session 8+. Today's session is upload/download only.

## Why server-side upload, not signed upload URLs?

Files are small (≤15 MB), so streaming through our Next.js server
costs almost nothing. The win is that we validate the MIME and size
BEFORE the file reaches Storage, returning friendly field errors. With
client-side direct-to-Storage uploads via signed URLs, validation
would be after-the-fact: we'd write a finalize endpoint that checks the
uploaded object size and either keeps it or deletes it (cleanup of
orphans on partial failures becomes its own problem).

When file sizes grow past ~50 MB or upload concurrency becomes a
bottleneck, swap to signed upload URLs. The DB model doesn't change.

## Why no server-side download proxy?

Same logic in reverse. Egress is cheaper from Supabase Storage
(within-region) than re-streaming through Vercel. Signed URLs give us
permission gating on the server, then let the user pull bytes
directly. The 60-second TTL is short enough that the worst case
("user pastes the URL in Slack") expires before anyone clicks it.

Audit log of "who downloaded what when" is a separate concern — when
we build the audit log (session 10), the signed-URL-creation event
itself is logged.

## Test plan

1. **Bucket setup**
   - Run `prisma/setup-storage-bucket.sql`
   - In Supabase Dashboard → Storage, confirm `documents` exists,
     private, 15 MB cap, allowed MIME types listed

2. **Upload — happy path**
   - Open an examination detail page
   - Documents section appears at the bottom, empty state
   - Click "Încarcă document" → pick "Buletin analize" → pick a PDF
   - File appears in the list with size + uploaded date + uploader name
   - In Supabase Storage browser, navigate to
     `{tenantId}/examination/{examId}/` — file is there with UUID prefix

3. **Upload — rejected types**
   - Try a `.exe`, `.zip`, or `.txt` — server returns 400 with
     "file type not allowed"
   - Try a >15 MB file — server returns 400 with "file is too large"
   - The Supabase bucket itself enforces the same caps as a safety net

4. **Download**
   - Click "Descarcă" on a row
   - Browser downloads the file with the original filename
   - URL in the address bar (if visible briefly) is signed; opening it
     after 60 seconds gives a 400 from Storage

5. **Delete**
   - Click "Șterge", confirm
   - Row disappears from the list
   - In Supabase Storage browser, the file is also gone
   - DB row has `deletedAt` set (verify in Studio if curious)

6. **Permissions**
   - Login as an assistant (read-only role)
   - "Încarcă document" button does NOT appear
   - "Șterge" buttons do NOT appear
   - "Descarcă" works (can read documents)

7. **Cross-tenant isolation**
   - Login as tenant A
   - Construct a URL: `/api/documents/{doc-id-from-tenant-B}/download` (POST)
   - Returns 404 (not 403, by design — don't leak existence)

8. **Polymorphic surfaces**
   - Upload docs on examination page → appear only there
   - Upload docs on employee page → appear only there
   - Same employee viewed twice in two browser tabs after refresh:
     consistent

## What's NOT in this session

- **Workplace + company document sections** — API supports them, UI
  doesn't surface yet (drop `<DocumentsSection entityType="company" ...>`
  on the page when you want it).
- **Auto-generated PDF on examination sign** — deferred. When we
  switch to real PDF generation (Puppeteer or `@react-pdf/renderer`),
  the sign action will write a Document row with
  `isGenerated: true` + `isOfficial: true`. The pipeline (this session)
  is what that future action will use.
- **Audit log** — who downloaded what, when (session 10).
- **Document versioning** — schema has `replacesDocumentId` and
  `version` fields; UI doesn't expose them yet.
- **Virus scanning** — Supabase's bucket-level MIME whitelist is a
  best-effort guard. For true virus scanning, we'd add ClamAV in front
  of the upload route. For now the MIME whitelist + size cap +
  serving via signed URLs (no auto-execute) is the threat model.
- **Bulk download** — one file at a time.

## What changes if a Vercel deploy fails on this session

Most likely culprits:

1. **`SUPABASE_SERVICE_ROLE_KEY` not set in Vercel** — the
   service-role client will throw at first request. Already set per
   session 5 invites; check `vercel env ls` to confirm.
2. **Bucket doesn't exist** — uploads fail with "Bucket not found".
   Re-run the SQL or create via dashboard.
3. **Stale Prisma client** — `DocumentEntityType` etc. won't exist.
   `npx prisma generate` locally, commit `prisma/generated/`? (Buzomed
   uses default generation, so the Vercel build regenerates — should
   be fine.) If errors persist, the build log will mention it.

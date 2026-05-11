# Buzomed — session 6: Examinations

The medical core. Schedule examinations, record clinical data, set a
verdict, sign the fișa de aptitudine, print it.

## What's in this bundle (21 files)

### New
- `prisma/seed-examination-types.sql` — 7 Romanian exam types (HG 355/2007)
- `lib/examinations/numbering.ts` — collision-safe `YYYY/NNNN` numbering
- `lib/examinations/recall.ts` — next-due-date calculator
- `lib/examinations/auto-location.ts` — lazy primary-location seed
- `app/api/examinations/route.ts` — GET list + POST create
- `app/api/examinations/[id]/route.ts` — GET / PATCH / DELETE
- `app/api/examinations/[id]/sign/route.ts` — sign action (immutability gate)
- `app/api/examinations/[id]/start/route.ts` — scheduled → in_progress
- `app/api/examinations/[id]/cancel/route.ts` — cancel / no_show
- `app/(authenticated)/examinations/page.tsx` — list with status tabs + counts
- `app/(authenticated)/examinations/new/page.tsx` — schedule form
- `app/(authenticated)/examinations/new/new-examination-form.tsx`
- `app/(authenticated)/examinations/[id]/page.tsx` — detail + clinical form host
- `app/(authenticated)/examinations/[id]/examination-form.tsx` — large multi-section form
- `app/(authenticated)/examinations/[id]/examination-actions.tsx` — start/cancel/no-show/sign buttons
- `app/(authenticated)/examinations/[id]/fisa/page.tsx` — printable fișa
- `app/(authenticated)/examinations/[id]/fisa/fisa.css` — A4 print styles
- `scripts/merge-i18n-session-6.mjs` — i18n key merge (270 keys total)

### Modified (replace existing files of the same path)
- `app/(authenticated)/employees/[id]/page.tsx` — adds "+ New examination" button, "Last examination" badge, recent examinations section
- `app/(authenticated)/companies/[id]/workplaces/[wid]/page.tsx` — adds "Recent examinations at this workplace" section
- `app/(authenticated)/layout.tsx` — adds "Examinări" nav link

## Integration steps

From your local `Buzomed/` repo root (Git Bash on Windows):

```bash
# 1. Extract the bundle into the repo (overwrites the three modified files)
cd C:/Projects/Buzomed
unzip -o /path/to/buzomed-session-6.zip

# 2. Apply the i18n merge — adds ~270 keys, keeps existing ones
node scripts/merge-i18n-session-6.mjs

# 3. Regenerate Prisma client (the schema has the new models already)
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# 4. Seed the 7 examination types into your Supabase database
#    Option A — via psql:
psql "$DATABASE_URL" -f prisma/seed-examination-types.sql
#    Option B — via Supabase dashboard:
#    Project → SQL Editor → paste the contents of seed-examination-types.sql → Run

# 5. Type check
rm -rf .next
npx tsc --noEmit
#    Expected pre-existing errors (same as session 5): ApiAuthResult union narrowing
#    in some routes. They don't block deployment.

# 6. Local smoke test
npm run dev
#    Open http://localhost:3000, sign in to a tenant.
#    Verify: /examinations renders empty state, "Examinări" appears in nav.

# 7. Commit + push
git add .
git commit -m "Session 6: Examinations + fișa de aptitudine"
git push
```

## Test plan

1. **List page** — `/examinations`
   - Empty state shows when no exams exist
   - Status tabs (All / Scheduled / In progress / Completed) with counts
   - Each tab filters correctly

2. **New examination** — `/examinations/new`
   - Refuses if no eligible employees (employee must have a current
     workplace assignment)
   - Practitioner defaults to current user if they have practitioner role
   - Creating an exam allocates next `YYYY/NNNN` number
   - Selecting employee shows their current workplace

3. **Detail page** — `/examinations/[id]`
   - Metadata visible (practitioner, request source, etc.)
   - BMI auto-calculates from height + weight
   - Diagnoses field: one per line, stored as array
   - Verdict radio: conditional fields appear (conditions / inapt_until / next due)
   - Save button is sticky at the bottom

4. **Status transitions**
   - Start scheduled → in_progress, sets startedAt
   - Cancel → status=cancelled, exam preserved
   - No-show → status=no_show, exam preserved
   - All these are blocked if exam is signed

5. **Signing**
   - Cannot sign without a verdict set
   - inapt_temporar requires `inaptTemporarUntil` date
   - After signing: form is locked, fișa link appears, can't be deleted
   - Next-due date auto-fills if `apt`/`apt_conditionat` and field is empty
   - Practitioner can override next-due before signing

6. **Fișa de aptitudine** — `/examinations/[id]/fisa`
   - Renders with cabinet name, exam number, worker, employer, workplace
   - Verdict shows with ☒ checkbox style
   - "Draft" banner if not signed
   - Browser Print → A4 page, nav/headers hidden by `@media print`

7. **Cross-tenant isolation**
   - User in tenant A cannot see tenant B's examinations
   - Cannot view tenant B's exam by direct ID

8. **Assistant role**
   - Can read examinations (GET works)
   - Cannot create / patch / sign (POST/PATCH/POST returns 403)

9. **Related views**
   - Employee detail shows recent exams + "Last examination" + "+ New" button
   - Workplace detail shows "Recent examinations at this workplace"

## Design decisions baked in

- **Q1=c** — 7 Romanian exam types seeded; management UI deferred
- **Q2=c+free-text** — Structured forms (~15 fields) + free-text notes per section
- **Q3=b path to c** — HTML print-to-PDF preview; real PDF generation later
- **Q4=c** — Auto-calculates next-due date, practitioner can override
- **Q5=b** — Auto-creates "Sediu principal" location on first use; Locations UI deferred

## What's NOT in this session

- Real PDF generation (current: browser print). Path to add: swap fisa.css for `@react-pdf/renderer` rendering same template.
- Locations CRUD (one auto-created location is enough for single-site cabinets)
- ExaminationType management UI (super_admin-level; types are seeded)
- Audit log of who-edited-what-when (planned for session 10)
- Document uploads attached to exams (planned for session 7)
- Vaccination tracking (planned for session 9)
- Recall dashboard ("exams due in next 30 days") — the data is there, the UI isn't
- Recall record auto-creation on sign — schema has `Recall` model, deferred to recall dashboard session

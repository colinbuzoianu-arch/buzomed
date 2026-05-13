# Buzomed — session 9: Recall dashboard

Cabinets stop tracking recalls in Excel. The dashboard surfaces every
upcoming and overdue periodic examination, with one-click scheduling
and per-row cancellation. A red counter on the nav makes overdue
impossible to miss.

## What's in this bundle (10 files + README)

### New
- `lib/recalls/upsert-from-examination.ts` — idempotent helper that creates/updates a Recall row when an examination is signed
- `app/api/recalls/route.ts` — GET list with horizon + company filters, lazy `pending → overdue` promotion
- `app/api/recalls/[id]/route.ts` — GET single, PATCH `action=cancel`
- `app/api/recalls/[id]/schedule/route.ts` — POST: creates a scheduled examination from a recall, marks the recall completed, all atomic
- `app/(authenticated)/recalls/page.tsx` — main dashboard
- `app/(authenticated)/recalls/recall-actions.tsx` — per-row schedule/cancel dialogs
- `prisma/backfill-recalls.sql` — one-time backfill for examinations signed before session 9
- `scripts/merge-i18n-session-9.mjs` — ~40 keys per locale

### Modified
- `app/api/examinations/[id]/sign/route.ts` — wraps sign in a transaction and calls `upsertRecallFromExamination`
- `app/(authenticated)/layout.tsx` — adds Recalls nav link with red overdue counter badge

## Pre-flight checks (NEW for session 9)

Before unzipping, verify these are in place from earlier sessions:

```bash
# 1. The build script must include prisma generate (from session 8 fix)
grep '"build"' package.json
# Expected: "build": "prisma generate && next build",
# If missing, your Vercel deploy will fail on the regenerated Prisma client.

# 2. CNP encryption key must be in both .env.local AND Vercel
grep CNP_ENCRYPTION_KEY .env.local | head -1
# Expected: a base64 string. Restart dev server if you just added it.
```

Neither prerequisite is new in session 9 — but if you skipped them in session 8, recall scheduling will fail in weird ways.

## Integration steps

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-9.zip

# 1. No schema changes this session. The Recall model already existed
#    in your schema.prisma from session 1. Just regenerate to be safe.
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# 2. Run the backfill SQL. Pick ONE:
#    Option A — Supabase Dashboard → SQL Editor → paste prisma/backfill-recalls.sql → Run
#    Option B — psql command:
psql "$DIRECT_URL" -f prisma/backfill-recalls.sql

# 3. Merge i18n
node scripts/merge-i18n-session-9.mjs

# 4. Clean restart (Turbopack quirk — see "what I learned" below)
rm -rf .next
npx tsc --noEmit
npm run dev

# 5. Smoke test (see Test plan below)

# 6. Commit + push
git add .
git commit -m "Session 9: Recall dashboard with horizon filters + scheduling"
git push
```

## Design decisions baked in

- **Q1 = (b)** — Materialized `Recall` table, not a computed view. Sign action now creates a Recall row inside the same transaction. Idempotent helper means the backfill and the sign action share logic.
- **Q2 = (d)** — Five horizon tabs: Overdue / This week / This month / Next 3 months / All. "This month" is the default.
- **Q3 = (a)** — Table view, sorted by status (overdue first) then due date ascending.
- **Q4 = (c)** — Overdue rows highlighted red AND a counter badge on the nav link.
- **Q5 = (d)** — Per-row Schedule (creates exam, marks recall completed) + Cancel (with optional reason).
- **Q6 = (a)** — No notifications wired in session 9. The `notificationSentAt` schema field stays unused until session 10+ when we know what cabinets actually want.

## Test plan

### Setup
1. Restart `npm run dev`
2. Run the backfill SQL (option A or B above)
3. In Supabase: `SELECT count(*) FROM recalls WHERE status IN ('pending','overdue');` — should be >0 if you signed any examinations in earlier sessions

### Dashboard basics
4. Navigate to `/recalls` (or click "Rechemări" in the nav)
5. Verify the page renders with "Luna aceasta" (This month) tab active
6. If you have overdue recalls, the **Overdue** nav badge should be red with a count
7. Click the "Întârziate" tab → should show only overdue rows, highlighted red

### Filters
8. Click "Luna aceasta" → should show recalls due within 30 days
9. Click "Următoarele 3 luni" → wider range, more rows
10. If you have multiple companies, click a company name to filter → only that company's workers
11. Click "Toate" to clear the company filter

### Schedule a recall
12. Pick a pending recall row → click **Programează**
13. Inline form appears: practitioner dropdown + optional datetime
14. Pick a practitioner (defaults to you if you're a practitioner)
15. Leave datetime empty (creates "open slot")
16. Click **Creează examinarea**
17. Should redirect to the new examination detail page
18. Examination should show status=scheduled, the right employee/workplace/type, and a note saying it was created from a recall
19. Go back to `/recalls` — the source recall should be gone (status=completed, hidden)

### Cancel a recall
20. Pick another pending recall → click **Anulează**
21. Type a reason like "lucrătorul a părăsit compania"
22. Click **Confirmă anularea**
23. Recall disappears from the dashboard
24. In Supabase: `SELECT id, status, notes FROM recalls WHERE id = '<that recall id>';` — should be cancelled with the reason appended to notes

### Sign creates a recall (regression check)
25. Create a new examination, fill in apt verdict, sign it
26. Within seconds, a new pending recall should appear in `/recalls?horizon=next3Months`
27. The dueDate should match the examination's nextExaminationDueDate

### Inapt verdict creates NO recall (regression check)
28. Create another examination, set verdict=inapt (not inapt_temporar), sign it
29. Verify no recall was created — `SELECT * FROM recalls WHERE created_from_examination_id = '<that exam id>';` should return 0 rows
30. This is intentional — inapt workers don't get scheduled returns

### Overdue lazy promotion
31. In Supabase, manually set one recall's due_date to yesterday:
    ```sql
    UPDATE recalls SET due_date = CURRENT_DATE - 1 WHERE id = '<some pending recall>';
    ```
32. Refresh `/recalls` — that recall should now appear in the Overdue tab (the page auto-promoted it on read)
33. Verify with `SELECT status FROM recalls WHERE id = '<that recall>';` — should be `overdue`

### Empty states
34. Click "Luna aceasta" with company filter set to a company that has no upcoming recalls → empty state message
35. If you have no overdue recalls, the Overdue tab should show "Bine făcut — cabinetul e la zi"

## What's NOT in this session

- **Notifications** (email/SMS to workers about upcoming exams). Deferred to a later session once we know whether cabinets want it.
- **Bulk operations** (select multiple recalls, schedule all). Single-click suffices for MVP. Add later if cabinet feedback asks for it.
- **Calendar view**. Table won the design decision.
- **Recalls without a source examination** (e.g., "first exam due in 60 days based on new hire date"). Schema supports it (`createdFromExaminationId` is nullable) but no UI exists to create one.
- **Audit log of recall actions**. Cancellation reasons append to the recall's `notes` field as a textual stamp; proper audit log is session 10+.

## What I learned during integration (for future sessions)

Three patterns I'll keep applying:

1. **Schema patches as runnable scripts, not Markdown.** Session 8 had a `SCHEMA_PATCH.md` you had to read and apply manually. Easy to skip — and you did. Session 9 has no schema change, but the next session that needs one will ship the patch as a `scripts/apply-schema-patch-N.mjs` that edits `prisma/schema.prisma` programmatically.

2. **Build script verification belongs in pre-flight.** Adding `prisma generate` to the build script was a session-8 fix done under fire. The pre-flight checks above will now exist on every session that changes the Prisma client.

3. **Env var changes always require explicit restart.** Adding to the README isn't enough — for any session that adds env vars, the restart step lives in the integration checklist as its own line, not as a comment.

## Where this leaves Buzomed

After session 9, Buzomed has the full minimum-viable workflow:

- Companies + workplaces + risk profiles
- Employees with encrypted CNPs
- Examinations with clinical forms and signed fișa de aptitudine
- Documents (uploaded to Supabase Storage)
- Recall dashboard that closes the loop

Session 10 candidates: reporting/CSV export, vaccinations, or audit log. My recommendation when you come back: **session 10 = reporting, then PAUSE for cabinet outreach before session 11.** You're at the point where one real practitioner's feedback would reshape what we build next better than I can guess at.

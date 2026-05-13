# Session 10 fixup — merge Programări into Examinări as "Scadențe" tab

Targeted UX cleanup, not a full session. Four files. ~5 minutes to apply.

## What this changes

The Programări nav link and its dedicated `/recalls` page caused naming confusion with the "Programate" status filter in Examinări (both translate to "scheduled" in English). Two different concepts, one Romanian word apart, no UI signal which is which.

This fixup folds Programări into Examinări as a new "Scadențe" tab. Same data, same actions (Programează / Anulează per row), same horizon filters (Săptămâna aceasta / Luna aceasta / etc.). It just lives inside the Examinări page now.

The tab order reflects the actual workflow: **Scadențe → Programate → În curs → Finalizate → Toate**. A future obligation (Scadențe) becomes a scheduled exam (Programate) becomes in-progress becomes finalized — and that finalized exam triggers a new Scadențe entry ~12 months later.

## What's in this bundle (4 files)

### Modified
- `app/(authenticated)/examinations/page.tsx` — major rewrite; hosts both the existing exam table AND the recall table under tabs
- `app/(authenticated)/layout.tsx` — removes the Programări nav link and its overdue counter (the counter moved onto the Scadențe tab itself, where it's contextually honest)
- `app/(authenticated)/recalls/page.tsx` — becomes a thin redirect to `/examinations?tab=scadente` so bookmarks and muscle memory still work

### New
- `scripts/merge-i18n-session-10-fixup.mjs` — adds one key per locale: `examinations.tabs.scadente`

## Pre-flight check

```bash
git log --oneline -3
# Top commit should be 53da695 (Session 10) or later
```

## Integration

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-10-fixup.zip

node scripts/merge-i18n-session-10-fixup.mjs

rm -rf .next
npm run dev
```

No schema changes. No env vars. No prisma generate needed (no Prisma schema changes — only existing types are used).

```bash
git add .
git commit -m "fixup: merge Programări into Examinări as Scadențe tab"
git push
```

## URL changes

| Old URL | What happens |
|---|---|
| `/recalls` | Redirects to `/examinations?tab=scadente` |
| `/recalls?horizon=overdue` | Redirects to `/examinations?tab=scadente&horizon=overdue` |
| `/recalls?horizon=thisWeek&companyId=X` | Redirects to `/examinations?tab=scadente&horizon=thisWeek&companyId=X` |
| `/examinations?status=scheduled` | Still works — interpreted as `tab=programate` |
| `/examinations?status=in_progress` | Still works — interpreted as `tab=in_curs` |
| `/examinations?status=completed` | Still works — interpreted as `tab=finalizate` |

The defaults change too: `/examinations` with no query params lands on **Scadențe** instead of **Toate**. Reason: Scadențe is the actionable view ("who do I call today"). Toate is the audit/history view; it's still one click away.

## Test plan

1. Navigate to `/examinations` → defaults to Scadențe tab, horizon = "Luna aceasta"
2. If you have overdue recalls, the Scadențe tab has a red counter badge AND the "Întârziate" horizon sub-tab is red with the same number
3. Click "Programate" → see scheduled examination records (status=scheduled)
4. Click "În curs" → see in-progress exams
5. Click "Finalizate" → see completed exams
6. Click "Toate" → see every exam record (no recall data here)
7. From Scadențe tab, pick a row → click **Programează** → fill in practitioner + optional date → submit → redirects to the new examination's detail page
8. Go back to `/examinations`, click "Programate" tab → the newly-scheduled exam appears here. This is the workflow handoff in action.
9. From Scadențe tab, pick another row → click **Anulează** → enter optional reason → confirm → row disappears
10. Visit `/recalls` directly → should redirect to `/examinations?tab=scadente`
11. Visit `/recalls?horizon=overdue` → redirects with horizon param preserved
12. Verify the Programări nav link is GONE from the header. The top nav now reads: Companii, Angajați, Examinări, Rapoarte, Echipă.
13. Visit `/examinations?status=scheduled` (the old URL format) → still works, lands on the Programate tab
14. Open `/reports` operational dashboard → the "Overdue recalls" stat card still links to `/recalls?horizon=overdue` which redirects to `/examinations?tab=scadente&horizon=overdue`. Click it → confirm you land on the right view.

## Architecture notes

The `RecallActions` client component (the schedule/cancel inline forms) is now imported by `/examinations/page.tsx` from `../recalls/recall-actions`. The file lives in the recalls/ directory but is shared across both surfaces. No duplication.

The API routes at `/api/recalls/...` are unchanged. The page that uses them is what's changed.

The `app/(authenticated)/recalls/recall-actions.tsx` file is still in place because Examinări imports it. Don't delete it.

## What's not changing

- The Recall table in Postgres
- The `/api/recalls/*` API routes  
- The sign action's behavior of creating Recall rows from signed examinations
- The lazy `pending → overdue` promotion
- The reports module — `/reports` operational dashboard still shows "Programări întârziate" (overdue recalls) as a stat card

## Strategic context (unchanged from session 10 README)

You now have a coherent product without naming confusion. The same recommendation stands: **before more code, talk to one cabinet.** This UX cleanup makes it easier to demo without explaining "well, Programări and Programate are different things..." — that conversation would have lost a sale.

Session 11 if you keep building: PDF-on-sign (closes the loop opened in session 6). If you do outreach first: session 11 = whatever the cabinet says it should be.

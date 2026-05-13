# Buzomed — session 11: Branding + mobile + bulk import 

Three concerns shipped as one bundle. Designed to be applied in one
unzip but committed in three separate commits so any failure can be
reverted cleanly without losing the others.

## What's in this bundle (21 files + README)

### Branding (8 files)
- `public/buzomed-icon.png` — icon-only, transparent background, 512×512
- `public/buzomed-wordmark.png` — icon + wordmark + tagline
- `public/favicon.ico` — multi-size ICO (16/32/48)
- `public/icon-192.png`, `public/icon-512.png` — PWA icons
- `public/apple-touch-icon.png` — iOS home-screen pin (180×180)
- `components/buzomed-logo.tsx` — shared component with icon/wordmark variants
- `app/layout.tsx` (modified) — favicon metadata, viewport config, themeColor
- `app/login/page.tsx` (modified) — wordmark on login screen

### Mobile (5 files)
- `components/mobile-nav.tsx` — hamburger drawer with body-scroll-lock and close-on-route-change
- `app/(authenticated)/layout.tsx` (modified) — icon logo + responsive nav + hamburger trigger
- `app/(authenticated)/companies/page.tsx` (modified) — table on desktop, cards on mobile
- `app/(authenticated)/employees/page.tsx` (modified) — same pattern + Import button
- `app/(authenticated)/examinations/page.tsx` (modified) — responsive header, table with explicit min-width
- `app/(authenticated)/reports/page.tsx` (modified) — responsive h1 + tables

### Bulk import (5 files)
- `package.json` (modified) — adds `papaparse` (CSV) and `xlsx` (Excel) + types
- `lib/employees/import-parser.ts` — CSV + Excel parser with fuzzy Romanian/English header detection
- `app/api/employees/import/commit/route.ts` — server commit endpoint with per-row outcome reporting
- `app/(authenticated)/employees/import/page.tsx` — server page with company picker
- `app/(authenticated)/employees/import/import-client.tsx` — full client UI (upload → mapping → preview → commit)

### i18n
- `scripts/merge-i18n-session-11.mjs` — adds 56 keys per locale + renames `Marca`→`ID angajat` everywhere

## Pre-flight check

```bash
git log --oneline -3
# Top commit should be 45b5e91 or later (the verdictReason fix from session 10)
```

## Integration — applied in ONE step

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-11.zip

# 1. New dependencies: papaparse + xlsx
npm install

# 2. Regenerate Prisma (no schema change, but verify clean state)
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# 3. Merge + rename i18n
node scripts/merge-i18n-session-11.mjs

# 4. Clean restart
rm -rf .next
npx tsc --noEmit
npm run dev
```

## Committed in THREE commits (this is the important part)

Once everything is unzipped and tested locally, commit in this order so each can be reverted in isolation if something breaks in production:

```bash
# Commit 1 — Branding
git add public/ \
        components/buzomed-logo.tsx \
        app/layout.tsx \
        app/login/page.tsx
git commit -m "feat(branding): add logo, favicon, viewport meta"

# Commit 2 — Mobile responsive
git add components/mobile-nav.tsx \
        "app/(authenticated)/layout.tsx" \
        "app/(authenticated)/companies/page.tsx" \
        "app/(authenticated)/employees/page.tsx" \
        "app/(authenticated)/examinations/page.tsx" \
        "app/(authenticated)/reports/page.tsx"
git commit -m "feat(mobile): hamburger nav, responsive cards on list pages"

# Commit 3 — Bulk employee import
git add package.json package-lock.json \
        lib/employees/ \
        "app/api/employees/import/" \
        "app/(authenticated)/employees/import/"
git commit -m "feat(employees): bulk import from CSV/Excel"

# Commit 4 — i18n (covers all three above)
git add scripts/merge-i18n-session-11.mjs \
        messages/ro.json \
        messages/en.json
git commit -m "i18n: session 11 keys (branding + mobile + bulk import); rename Marca→ID angajat"

git push
```

If any single commit blows up Vercel, `git revert <hash> && git push` and the others remain intact.

## Design decisions baked in

### Logo placement
- **Header (every authenticated page)**: icon-only at 36px tall. Wordmark would dominate the nav.
- **Login page**: wordmark, centered, 320×100.
- **Favicon**: icon-only, 32×32 multi-size ICO + PNG variants for retina.
- **Apple touch icon**: 180×180, used when iOS users add to home screen.
- **Tagline**: stays English ("Occupational Health. Healthy Workplaces.") on the wordmark asset. If you decide to commission a Romanian-language wordmark variant later, swap `public/buzomed-wordmark.png` — no code changes.

### Mobile nav
- **Pattern**: hamburger that slides a drawer down from the top, full-width, with backdrop. Body scroll locks while open. Closes automatically on route change.
- **Why not bottom tabs**: cabinets will use desktop most of the time. Bottom tabs assume a mobile-first product; we have a desktop-first product that should also work on phones.
- **Breakpoint**: hamburger appears below `md` (768px). User name and logout move into the drawer on mobile.

### Mobile table strategy (hybrid)
- **Cards for browsing** (Companies, Employees lists): each row becomes a tappable card with truncated metadata.
- **Tables stay for analysis** (Examinări, Reports): horizontal scroll with explicit `min-w-[600-720px]` to keep columns from squishing weirdly. Negative left/right margin on small screens so the scroll feels edge-to-edge.

### Bulk import
- **No CNP in import**: cabinets get the employee list from HR before the worker shows up for their first exam. CNP gets captured in person at the exam. The bulk-imported employee starts with `idDocumentType='other'`, `idDocumentNumber=null`.
- **Scoped to one company per import**: you pick the destination company first. All rows go to that company. The "department" column maps to a `Workplace` at that company.
- **No auto-creation of workplaces**: if a row's department doesn't match an existing workplace name OR department field (case-insensitive), the row is REJECTED. Workplaces drive risk profile + exam intervals + required exam types — silent creation hides important config.
- **Format detection**: accepts CSV (auto-detects comma/semicolon/tab delimiter) and Excel (.xlsx, .xls). UTF-8 with optional BOM. SheetJS is loaded lazily — only when the user actually selects an Excel file.
- **Fuzzy header detection**: Romanian and English aliases. `prenume`/`nume`/`first name`/`last name`/`marca`/`matricola`/`id angajat`/`employee id`/`departament`/`workplace`/etc all map correctly. Diacritics ignored for matching.
- **Duplicate handling**:
  - **Within file** (same name or email appears twice): warning, both rows allowed through.
  - **Against database** (an existing employee in the cabinet has the same name OR email): skipped by default with a checkbox to "Import anyway".
- **Per-row outcomes**: the server returns a report with `created`/`skipped`/`failed` per row. Mid-batch failures don't abort the rest.
- **Max 500 rows per import**. Larger batches should be split.

### Naming change: Marca → ID angajat
The Romanian translation "Marca" (or "Marcă") was barely understandable in context. Renamed to "ID angajat" everywhere it appears — the employees list table header AND the employee form field. Forced rename (overwrites existing values).

## Test plan

### Branding
1. Open `/` in a fresh browser tab — the favicon tab icon should show the Buzomed shield
2. Sign out → on the login page, verify the full wordmark logo + tagline appears centered
3. Sign in → the header shows the icon logo (36px) on the left of the nav
4. Click the icon → routes back to `/`
5. On iOS Safari, "Add to Home Screen" → the home icon should be the Buzomed shield, not a screenshot
6. View page source `<head>` → should include `<meta name="theme-color" content="#1e3a8a">` and the icon link tags

### Mobile responsive (use phone or DevTools device mode ≤ 640px width)
7. Open `/companies` on mobile — header stacks vertically, "+ Companie nouă" button below the title
8. The hamburger icon appears in the top right; tap it → drawer slides down with user name, all nav items, logout button at bottom
9. Tap a nav item → drawer closes automatically, route changes
10. Tap outside the drawer (the dark overlay) → drawer closes
11. Open `/employees` on mobile — list renders as cards instead of a table. Each card shows name, ID doc, employee ID, status badge in the corner
12. Open `/examinations` on mobile — the tabs row scrolls horizontally if too wide; the Scadențe table scrolls horizontally with predictable width
13. Open `/reports` on mobile — stat cards in 2 columns, tables scroll horizontally with min-width preserved
14. Long names (try "Vasilescu-Marinescu Alexandra-Mihaela") should truncate with `...` not break the layout

### Bulk import — happy path
15. Sign in as practice_admin
16. Go to `/employees` → click **Importă**
17. Pick a company from the dropdown (must have at least one workplace already)
18. Click **Descarcă șablon CSV** in the help section → save the template file
19. Open the template, fill in 2-3 rows with names + departments that match existing workplaces at the chosen company. Save.
20. Upload the filled template
21. Verify the preview table appears, mapping summary shows detected columns, all rows show "✓ OK"
22. Click **Importă (N)** → result screen shows "N created, 0 skipped, 0 failed"
23. Go back to `/employees` — the new employees appear in the list

### Bulk import — fuzzy header detection
24. Create a new CSV with headers `Prenume,Nume,Marca,Email,Departament` (Romanian)
25. Upload — verify the mapping detects all five columns correctly
26. Create another with `First Name,Last Name,Employee ID,Email,Department` (English)
27. Upload — mapping should still detect all five

### Bulk import — error paths
28. Upload a file with a row missing first name → preview shows it as red with "Prenumele lipsește" issue
29. Upload a file with a department that doesn't exist at the chosen company → row is red with "Departamentul nu corespunde" issue
30. Try to import the file as-is → only the valid rows commit, errored rows are excluded from the count
31. Upload a file with a duplicate of an existing employee → preview shows it as amber warning
32. Default ("Skip duplicates") leaves it out of the import → server reports it as skipped
33. Toggle to "Import duplicates anyway" → the second copy gets created (with the same name)

### Bulk import — Excel
34. Save the same template as `.xlsx` in Excel → upload → should parse correctly
35. Check the browser network tab while uploading — the xlsx library only loads when an Excel file is selected (lazy import working)

### Marca rename
36. Go to `/employees` — column header now says "ID angajat" (not "Marca")
37. Open any employee detail → "ID angajat" appears in the metadata
38. Click edit on an employee → the form field is labeled "ID angajat" (not "Marca / număr de legitimație")

## What's NOT in this session

- **Bottom tab bar mobile nav** — chose hamburger because Buzomed is desktop-first. Reconsider if a cabinet specifically asks for a more mobile-native feel.
- **Bulk import with CNP** — deliberately excluded because CNP comes from the in-person exam, not from HR.
- **Workplace auto-creation during import** — too dangerous; risk profile etc. should be set deliberately.
- **PWA / installable app manifest** — the icons and theme-color are in place but no `manifest.json` yet. One-line addition if you ever want this.
- **Print stylesheets re-audited for mobile** — they still target A4 paper; mobile browsers handle their own scaling.

## Strategic reminder (last time, I promise)

You now have:
- Real branding integrated into the product
- A mobile experience that works on a phone in a cabinet hallway
- A way to onboard 50 workers from HR in 2 minutes instead of typing them one by one

The bulk import is the feature most likely to make a real cabinet say "okay, I'll try this for a month." It removes the largest single objection to switching from ISIS Med.

This is a genuinely demoable product. Send the LinkedIn message this week.

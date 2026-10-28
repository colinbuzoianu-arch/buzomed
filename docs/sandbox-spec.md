# Spec — Buzomed interactive sandbox (no database, no accounts)

Goal: a public, clickable replica of Buzomed that Colin sends to prospects as a link (and can embed in a hidden Wix
page). It looks and behaves like the real app, filled with fake data, but has **no backend at all**: no database,
no Supabase auth, no API calls, no AI calls. Everything runs in the browser and resets on reload.

What the prospect can do:
- Click through every main page: Dashboard, Examinări (all tabs), an examination's full stepper (all steps,
  „Toate aparatele în limite normale", Pe-foaie markers, pre-sign checklist, „Vezi foaia", sign), Angajați, Firme,
  Rapoarte (with charts), Iris.
- Companies and employees are **display-only**: lists, counts and filters work, rows do not open (cursor default,
  small tooltip „În demo, fișele se deschid doar din examinări").
- Administrare / Setări / Echipă / Facturare / API: visible in the navigation but disabled with a tooltip
  „Disponibil în versiunea completă".

Work in phases. After each: `npx tsc --noEmit` + Biome, `git diff --stat`, short summary + screenshots, STOP for my
OK. **The real app's behaviour and output must not change** — any shared component you touch must render
identically for the real pages. No production deploy without my approval.

---

## Architecture (do not deviate without asking)

1. **Lives in this repo** as a public route group `app/(sandbox)/sandbox/**` (URL `/sandbox`), so it reuses the
   real components and stays in sync with the product. Add `/sandbox` to the public-route allowlist in
   `lib/supabase/middleware.ts` (exact prefix match `/sandbox`).
2. **Hard isolation from the backend:**
   - Nothing under `app/(sandbox)/**` or `lib/sandbox/**` may import `@/lib/prisma`, `@/lib/auth`,
     `@/lib/supabase/**`, `@/lib/crypto/**`, `@anthropic-ai/sdk`, `@/lib/email/**`, or define server actions /
     route handlers. Add `scripts/check-sandbox-isolation.ts` that greps the import graph of those folders
     (direct imports + one level of `@/components/**` they use) and fails on a forbidden import; run it in
     `npm run lint`.
   - **Fetch shim:** the sandbox layout installs (client-side, on mount, only on `/sandbox` pages) a wrapper around
     `window.fetch` that intercepts every request to `/api/**` and answers from the in-memory mock store
     (`lib/sandbox/mock-api.ts`). Any `/api/**` path without a mock returns `{ error: 'sandbox' }` with status 200
     — **never** passes through to the network. Non-API requests (static assets) pass through.
   - **window.open shim:** maps `/api/examinations/<id>/documents/<docKey>` and `/api/examinations/<id>/fisa-pdf`
     to static PDFs under `public/sandbox/pdfs/` (see Phase 2).
   - `router.refresh()` calls from reused components are harmless (sandbox pages are static); verify.
3. **Data:** `lib/sandbox/fixtures.ts` — one deterministic fake dataset (seeded RNG, dates relative to "today"
   at runtime), all names/CUIs/CNPs obviously fictional. A React context `SandboxStoreProvider` holds a mutable copy
   in memory (optionally mirrored to sessionStorage, try/catch) so edits inside an examination persist while the tab
   is open; reload or „Resetează demo" restores the fixtures.
4. **Reuse real components** wherever they are presentational/client: `ExaminationStepper` and its steps,
   `ClinicalSystemsExam`, `SupplementaryExams`, `SheetMarker`, the examination context card, VerdictBadge, the
   employees bulk table + overview strip, report chart components, dashboard cards. Where a real page builds its
   markup inline in a server component that queries the DB, extract the presentational part into a component that
   both the real page and the sandbox page render (real page output must be identical), or — if extraction is
   large — ask me before duplicating markup.
5. **Labels/i18n:** sandbox pages are server components that read `messages/ro.json` via the existing translator
   (no DB) and pass labels down exactly as the real pages do. Romanian only.
6. **SEO / framing:** `/sandbox/**` sends `X-Robots-Tag: noindex, nofollow` and a
   `Content-Security-Policy: frame-ancestors 'self' https://*.wixsite.com https://*.wix.com <WIX_SITE_DOMAIN>`
   (env `SANDBOX_FRAME_ANCESTORS`, space-separated) — only for `/sandbox/**`; the rest of the app keeps its current
   headers.

---

## Phase 1 — Shell, isolation, fixtures, dashboard

- `app/(sandbox)/sandbox/layout.tsx`: the same visual shell as the authenticated app (header, nav, footer) built
  from the real nav component if it can take its items as props; otherwise a sandbox nav with the same styles.
  Logged-in user shown as „Dr. Ana Demo — Cabinet Demo". Disabled admin items as described above.
- Sandbox banner (top, slim): „Demo interactiv Buzomed — date fictive, nimic nu se salvează." +
  „Resetează demo" + CTA „Vreau Buzomed" → env `NEXT_PUBLIC_SANDBOX_CTA_URL` (fallback `/contact`).
- Isolation script + fetch shim + window.open shim + store provider.
- Fixtures (all used by later phases):
  - 6 companies (metal fabrication, logistics, construction, office/IT, food production, water utility), 2–4
    workplaces each, realistic risk profiles.
  - ~120 employees; a few with missing job title / missing CNP, a few archived, a few without workplace.
  - ~250 examinations over 12 months (mostly control periodic, then angajare, adaptare, reluare, supraveghere
    specială; ~85 % apt, ~10 % apt condiționat with conditions, few inapt temporar / inapt), periodic ones with a
    filled `clinicalExam`, vitals, supplementary exams; one revoked fișă with a replacement.
  - Recalls: ~10 overdue, ~20 due within 30 days, rest later.
  - Today: 5 scheduled examinations at different times + 1 in progress stopped at step 2 (control periodic, the
    „hero" exam for the tour) + 1 angajare scheduled.
  - Fake CNPs are plain strings in the fixtures (there is no encryption here) and are never displayed in lists —
    only masked in the employee header, same as the real UI.
- `/sandbox` → dashboard: stat cards, „Azi" agenda, „Controale" card, using the real dashboard components fed with
  fixture data.

## Phase 2 — Examinations

- `/sandbox/examinations`: the real tabs with counts (scadențe, programate, în curs, finalizate, toate, avize) and
  the filter chips, all filtering the fixtures client-side. Rows open `/sandbox/examinations/[id]`.
- `/sandbox/examinations/[id]`: the real `ExaminationStepper` + context card, fully editable. Saving goes through the
  fetch shim into the store (validation errors from the real UI still appear where the UI does them). „Semnează"
  marks the exam signed in the store and shows the signed state. The pre-sign checklist works on fixture data.
  AI side panels (history summary, investigation recommender) get canned responses from the mock API that match
  the employee.
- `/sandbox/examinations/new`: the real new-examination form with fixture employees; creating adds a scheduled exam
  to the store and opens it.
- **Static PDFs:** write `scripts/build-sandbox-pdfs.ts` that uses the real PDF code (`pdf-fill.ts`,
  `buildPeriodicExamFields`, the fișă PDF document) on 3 fixture examinations — the hero periodic exam (all normal),
  one periodic with abnormal findings, one angajare — and writes `public/sandbox/pdfs/*.pdf` (fișa de aptitudine,
  examen periodic, examen angajare, dosar medical). Run it once and commit the PDFs. The window.open shim opens the
  closest matching static PDF; the sandbox shows a one-line note under „Vezi foaia": „În demo se deschide o foaie
  exemplu."

## Phase 3 — Employees, companies, reports, Iris

- `/sandbox/employees`: real overview strip + compact table + filters on fixtures; rows not clickable (see top).
- `/sandbox/companies`: list with employee counts and coverage %; rows not clickable.
- `/sandbox/reports` (+ expiration, compliance, hazards, practitioners, vaccinations): the real chart components
  and controls on fixture aggregates; CSV export works client-side.
- **Iris (scripted, no AI):** the real Iris chat UI, with 5 suggested questions shown as chips. Each has a
  pre-written Romanian answer computed from the fixtures (e.g. „Câți angajați au controlul depășit?",
  „Ce firme au cea mai mică acoperire?", „Ce investigații recomanzi pentru zgomot?", „Rezumă examinarea lui
  <hero employee>", „Pregătește-mi ziua de azi"), streamed word by word. Any free-typed question gets: „În demo
  răspund doar la întrebările sugerate. În versiunea completă, Iris lucrează cu datele cabinetului dumneavoastră."

## Phase 4 — Tour + polish

- „Tur rapid" panel (dismissible, bottom-right): 6 steps with links, ticking when visited (sessionStorage):
  Dashboard „Azi" → open the in-progress exam → „Toate aparatele în limite normale" → „Vezi foaia" → Semnează →
  Rapoarte › Conformitate → Iris.
- Mobile: the sandbox must be usable on a phone (prospects open links on phones) — nav collapses like the real app.
- Final check: open DevTools Network on every sandbox page and click through the whole tour — **zero requests to
  `/api/**` reach the network**, zero Supabase requests. Report the result.

## Files you may touch
`app/(sandbox)/**` (new), `lib/sandbox/**` (new), `public/sandbox/**` (new), `scripts/check-sandbox-isolation.ts`,
`scripts/build-sandbox-pdfs.ts` (new), `package.json` (lint script only), `lib/supabase/middleware.ts` (allowlist
line), `next.config.ts` (headers for `/sandbox/**` only), `messages/ro.json`. Extracting presentational components
from real pages: allowed, but list each one in your summary and confirm the real page renders identically.
Anything else: ask first.

## Embedding in Wix (Colin, manual)
Either send the direct link `https://<app domain>/sandbox`, or create a hidden Wix page (not in the menu, SEO
„hide from search") with an Embed → „Embed a site" element pointing to that URL, full width, ~900 px high, and set
`SANDBOX_FRAME_ANCESTORS` to the Wix site's domain(s) in Vercel.

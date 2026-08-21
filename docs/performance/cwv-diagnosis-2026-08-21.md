# Frontend Core Web Vitals Diagnosis — 2026-08-21

Diagnostic-only pass, no functional changes shipped in this document's scope (see the one gated, then reverted, tooling experiment in §A.1). Goal: find the concrete, code-verifiable causes of the production Speed Insights numbers — LCP 5.21s, FCP 3.8s, CLS 0.82, TTFB 0.7s (green), INP 56ms (green), Real Experience Score 40/100 — before touching any application code.

**Method:** static code reading across `app/`, `components/`, `lib/`, `next.config.ts`, plus two real production builds (`next build`, Turbopack) and Turbopack's native bundle-analysis tool. No live browser was available in this environment, so §A.3 (LCP element identification) is done by code inspection rather than a Chrome DevTools Performance recording — flagged explicitly below rather than fabricated.

---

## Executive summary

The dominant, code-provable CLS cause is a **skeleton/content dimension mismatch in the App Router `loading.tsx` files** for `/dashboard`, `/companies`, and `/examinations` — the skeleton always renders a fixed number of placeholder blocks that don't match the real (conditional, data-driven) content, so every fresh page load streams in a differently-sized real layout on top of the skeleton, on the three highest-traffic authenticated routes. The dominant LCP cause is specific to the public marketing route (`/`): the hero image is a **2573×3638px, 886KB source file** rendered with `next/image`'s `fill` mode but **no `sizes` attribute**, which defaults Next.js to requesting a near-full-viewport-width derivative on every device, including mobile — this is almost certainly where a prospect evaluating the site on their phone would feel "totul merge foarte greu." Backend and bundle-size investigation turned up nothing else of comparable severity: TTFB is genuinely fine, the app's JS is already well code-split (react-pdf/xlsx/swagger-ui-react are all correctly server-only or lazy-loaded), and the shared client bundle loaded on every route is a modest ~130KB gzipped.

---

## A.1 — Bundle analysis

**Tooling note (important):** `@next/bundle-analyzer` (the webpack plugin named in this task's brief) **does not work with this project** — Buzomed's `next build` runs on Turbopack (confirmed: Next.js 16.2.4 default), and the analyzer explicitly refuses with *"The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated."* I installed it, confirmed the failure, then **uninstalled it again** rather than leave a dead dependency — installing an incompatible tool that silently no-ops on every future `ANALYZE=true` build would be a worse outcome than not having it. The working alternative, built into Next.js already (no new dependency): `npx next experimental-analyze -o`, which writes a Turbopack-native module graph to `.next/diagnostics/analyze/`. That graph records module identities but — unlike the webpack analyzer — **not byte sizes** (sizes are computed live by its interactive web UI, which needs a browser). I did not have browser access in this environment either, so per-route byte breakdowns below come from directly measuring the built `.next/static/chunks/*.js` files on disk and cross-referencing Next's own `build-manifest.json` / `react-loadable-manifest.json` files to know which chunk belongs to which route — slower than the intended tool, but the numbers are real, not estimated.

**What this means for Phase B:** if bundle-size tracking over time is wanted, the actionable follow-up is `next experimental-analyze` run manually with a browser available (e.g. on a dev machine, or via `next experimental-analyze` without `-o` and port-forwarding), not re-adding `@next/bundle-analyzer`.

**Findings from measuring `.next/static/chunks/` directly (production Turbopack build):**

- Total client-side JS across the whole app: **3.62 MB parsed, 72 chunk files.** Almost none of this loads on any single page — see below.
- **Shared JS loaded on every single route** (Next's app-router root chunks, per `build-manifest.json`'s root file list): **6 files, 445 KB parsed / ~130 KB gzipped.** This is React 19 + ReactDOM 19 + the Next.js client runtime + root-layout client components (Toaster, CookieNotice/GA loader, SpeedInsights bootstrap). Not identifiable further — Turbopack's production output has no readable module-path debug comments (unlike its SSR/server chunks, which do), so I could not attribute exact KB to individual libraries within this shared bundle without the (browser-only) interactive analyzer.
- **Largest single chunk in the entire app: 1.18 MB parsed** (`0rcdg_.k96sii.js`). Confirmed via `grep` (`swagger-ui`) and cross-referenced against `.next/server/app/(public)/api-docs/page/react-loadable-manifest.json` — **this is `swagger-ui-react`, and it is correctly isolated to the `/api-docs` route only**, loaded through the existing `next/dynamic(..., { ssr: false })` in `app/(public)/api-docs/page.tsx`. It does not ship to any other route. Not a finding — flagged here only because "single library over 100KB parsed" was explicitly asked for and this is by far the largest one in the repo.
- No duplicate-library-under-different-versions issue found; no unexpectedly-bundled heavy library (`react-pdf`, `xlsx`, `tensorflow`, `tone`, chart libraries) — see §A.1 continued below and the Non-recommendations section.
- **Route-level "First Load JS" table (the classic webpack-era `next build` output) no longer exists in Next.js 16 + Turbopack** — confirmed by reading the actual `next build` output twice (see `build-baseline.log` in this session): every route prints only as `ƒ` (dynamic) with zero size column, for all 108 routes. This is a Next.js/Turbopack CLI change, not a Buzomed misconfiguration. See §A.5.

**Heavy-dependency bundle placement audit** (`xlsx`, `papaparse`, `@react-pdf/renderer`, `pdf-lib`, `swagger-ui-react` — the five genuinely large libraries in `package.json`):

| Library | Where imported | Client-bundled? |
|---|---|---|
| `@react-pdf/renderer` | Only inside `app/api/**/route.ts` files (fişă/invoice/report PDF generation) | **No** — server-only, and `next.config.ts` already lists it in `serverExternalPackages` |
| `xlsx` | `lib/hr-export/service.ts` (imported by two `app/api/**/route.ts` files only) | **No** — server-only |
| `pdf-lib` / `@pdf-lib/fontkit` | One `app/api/**/route.ts` file | **No** — server-only |
| `papaparse` | `lib/employees/import-parser.ts`, imported by `app/(authenticated)/employees/import/import-client.tsx` (`'use client'`) | **Yes**, legitimately — it parses a user-uploaded CSV in-browser, and it's ~20KB gzipped. Scoped to the one `/employees/import` route only, not shared. |
| `swagger-ui-react` | `app/(public)/api-docs/page.tsx` | **Yes**, but already lazy-loaded via `next/dynamic(..., { ssr: false })` — see above |

**None of these five need any Phase B change.** This matches and re-confirms `performance-audit-report.md`'s (2026-07-10) §8 finding — that audit already checked bundle composition and found it clean; this session's measurement (actual file sizes, not just import-site grepping) doesn't contradict it.

---

## A.2 — CLS root cause investigation

### Cause 1 — Fonts: checked, already correct, not a contributor

`app/layout.tsx` already uses `next/font/google` for both fonts (`Manrope`, `Fraunces`), both with `subsets: ['latin', 'latin-ext']` (Romanian diacritics covered) and `display: 'swap'`. `grep` across `app/`, `components/`, `lib/` for `@font-face`, `@import.*fonts`, `fonts.googleapis`/`fonts.gstatic` found **zero** matches outside next/font's own generated output and unrelated inline `font-family: Arial` strings inside email HTML templates (not rendered in the browser app at all — those are Brevo email bodies). **No action needed — Pattern F1 from this task's brief is already fully implemented.**

### Cause 2 — Images without explicit dimensions: mostly correct, one real gap, one high-impact `sizes` gap

- Nearly every `<Image>` in the app (`components/buzomed-logo.tsx`, `NavBar.tsx`, `app/(authenticated)/layout.tsx`'s footer logo, `practitioner-settings-client.tsx`'s stamp/signature previews, the `fisa-pdf-document.tsx` — actually `@react-pdf/renderer`'s own `<Image>`, unrelated to browser CLS) already passes explicit `width`/`height`.
- One raw `<img>` (not `next/image`): `components/tenant-logo.tsx`. Its wrapper `<div>` sets an explicit `height` but `width: 'auto'` (bounded by `maxWidth: 160`) — vertical space is reserved, but horizontal width can still shift slightly as the image decodes, since actual aspect ratio isn't known ahead of time. Low impact (small header-scoped element, `flexShrink: 0` container), but a real, fixable gap.
- **Higher-impact gap:** `app/(public)/page.tsx`'s hero (`<Image src="/buzomed_picture.png" fill priority ... />`, no `sizes` prop). The source file is **2573×3638px, 886KB** (measured directly from the PNG header) — a *portrait* photo being cropped into a wide landscape hero band via `object-fit: cover`, so a large fraction of the source's pixels are wasted even before transfer. Because there's no `sizes` attribute on a `fill` image, Next.js's default (`100vw`) applies, meaning **every device — including phones — requests a derivative sized near its own full viewport width**, at up to the image's full 2573px source width on wide desktop viewports. `fill` + explicit container dimensions (`minHeight: 92vh`) does correctly avoid a *dimension-unknown* CLS bug — this is an LCP/transfer-weight finding, not a CLS one. See §A.3/§A.4.

### Cause 3 — Content that appears after initial render: **the clearest, most verifiable CLS cause found**

Next.js App Router serves each route's `loading.tsx` as an immediate placeholder during server-side streaming, then swaps in the real Suspense-resolved content — this swap happens on every fresh page load (not just client-side soft navigation), so a skeleton/content size mismatch fires every single time a user lands on these routes. I compared each route's `loading.tsx` skeleton against its real `page.tsx` output directly:

- **`/dashboard`** (`app/(authenticated)/dashboard/loading.tsx` vs. `page.tsx`) — the most-visited page per the page's own code comment:
  - Skeleton always renders **3** "alert card" placeholders (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). Real content (`AlertCard`, lines 195-222) renders **0 to 3** cards, and the *entire section* is omitted (`{urgentCount > 0 && (...)}`) when there's nothing urgent — the common case for a healthy cabinet. Every load where `urgentCount === 0` collapses ~92px+ of skeleton to nothing.
  - Skeleton renders **4** stat-card placeholders (`grid-cols-2 lg:grid-cols-4`). Real content renders **5** `StatCard`s (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) — different count *and* different responsive breakpoints, so the grid reflows on every load regardless of data.
- **`/companies`** (`loading.tsx` vs. `page.tsx`) — skeleton hardcodes **6** desktop table rows / **5** mobile cards. `page.tsx`'s query (`prisma.company.findMany`, no `take`/pagination) returns **every** active company for the tenant — realistically anywhere from a handful to dozens (per the existing `list-audit-2026-08-20.md`, "20-100 client companies" is the stated realistic range for a tenant). The row count essentially never matches 6, so the table height shifts on every load.
- **`/examinations`** (`loading.tsx` vs. `page.tsx`) — skeleton hardcodes **7** list rows; the real page's tab-filtered, non-paginated-in-the-skeleton-sense list will also almost never be exactly 7.

This is a systemic pattern (same shape, three times, on the three highest-traffic authenticated routes) rather than an isolated bug, and it is squarely "Pattern F4" from this task's brief (reserve space for async content / match skeleton to real dimensions). **This is the diagnosis's top CLS recommendation.**

**Secondary, smaller CLS-adjacent finding:** `components/dashboard-greeting.tsx` (a `'use client'` component) computes `new Date().getHours()` directly in render, both during SSR (server's local time — UTC on Vercel) and again during client hydration (the visitor's local time — Romania, UTC+2/+3). Depending on time of day this can produce a genuine text mismatch (e.g. "Bună dimineața" vs. "Bună seara") between the server-rendered HTML and the hydrated client output, which React corrects post-hydration. The two greeting strings are similar enough in length that the *height* impact is likely small, but it is a real, reproducible hydration mismatch and worth a mention even though it's not believed to be a major contributor to the 0.82 CLS score by itself.

**Checked and ruled out as CLS sources:**
- `IrisPanel` (`components/iris/iris-panel.tsx`) — `position: fixed`, mounts/unmounts entirely outside document flow. Confirmed via its `fixed bottom-24 right-4` / `fixed bottom-4 right-4` classes. Whenever and however it renders, it cannot shift other content.
- `CookieNotice` — same pattern, `fixed bottom-4 left-4`, plus it starts invisible (`visible` state defaults `false`) and only appears after a `useEffect` checks `localStorage` — again, cannot cause CLS since it never participates in layout flow.
- `SubscriptionBanner` — `'use client'` but receives server-computed props (`subscription` fetched in `app/(authenticated)/layout.tsx`) and is rendered deterministically in the initial SSR pass; not gated behind a client-only fetch.
- `AppNav` (desktop) / `MobileNav` (mobile hamburger) — both use pure Tailwind responsive classes (`hidden md:flex` / `md:hidden`), rendered identically on server and client. No client-only "wait for mount to know viewport width" pattern that would otherwise cause a server/client layout mismatch.

### Cause 4 — Third-party scripts: not the driver

Only one third-party script exists in the codebase: Google Analytics (`components/ga-loader.tsx`), loaded via `next/script` with `strategy="afterInteractive"` — and it is **gated behind cookie consent** (`components/cookie-notice.tsx`), so for any visitor who hasn't yet accepted analytics cookies, the GTM script does not load at all. `@vercel/speed-insights` is the official package, already optimized per this task's own Pattern F5 guidance. There is no Google Tag Manager container script (only direct `gtag.js`), and no other third-party embed anywhere in `app/` or `components/`. **Not a meaningful contributor to CLS or LCP.**

---

## A.3 — LCP element identification (code-inspection method — see tooling caveat)

**Caveat, stated plainly:** this environment has no browser, so I could not run a real Chrome DevTools Performance recording or see Chrome's actual LCP-candidate highlight. The findings below are inferred from what's the largest above-the-fold element in each route's source, not measured directly. Treat the `/` finding as high-confidence (a `fill`-mode hero image covering ~92% of the viewport height is essentially always the LCP candidate on a page like this); treat the authenticated-route findings as medium-confidence hypotheses that Phase B's Lighthouse run (acceptance criterion 5) should confirm before or after the fix.

- **`/` (public landing page):** LCP candidate is almost certainly the hero `<Image src="/buzomed_picture.png" fill priority>` — it's the largest visible element (`minHeight: 92vh`, full-bleed), marked `priority` (correct — it does get a preload hint), but as covered in §A.2/§A.4, it's serving from an 886KB, 2573×3638px source with no `sizes` constraint. `priority` avoids the *lazy-loading* penalty but doesn't fix the *oversized-request* penalty.
- **`/dashboard`:** no large media element exists on this route at all. The largest visible element is most likely the `DashboardGreeting`'s `<h1>` (`text-[28px] sm:text-[32px]`) or, once data resolves, the alert-card/stat-card grid. Per `performance-audit-report.md` §7 (already-established, re-confirmed by my own reading this session): **no route in the app uses `<Suspense>` boundaries for partial rendering** — every page's async server component blocks entirely on its slowest query before any of its real content paints (the `loading.tsx` skeleton is what paints first, then the whole real subtree swaps in at once). Since TTFB is reported green (0.7s) in aggregate, this is unlikely to be the dominant LCP driver for authenticated routes specifically, but it means LCP here is coupled to whichever of the dashboard's 10 parallelized Prisma queries is slowest, with zero opportunity for partial paint.
- **`/companies`:** no large media; LCP candidate is likely the page header (`<h1>`) or the first table row, gated the same way.

**Net read:** the public marketing page (`/`) has a distinct, high-confidence, high-impact LCP problem (oversized hero image). The authenticated app's LCP problem is more diffuse and lower-confidence from static reading alone — it's coupled to full-page blocking renders with no streaming, which is a known, previously-documented architectural fact (not new in this session) rather than a quick fix.

---

## A.4 — Font loading audit

Already covered fully in §A.2 Cause 1 — restated for completeness per the brief's structure:

- **Families:** Manrope (sans, weights as shipped by `next/font/google` defaults) and Fraunces (serif/display, explicit `weight: ['300', '400', '500']`).
- **Loading mechanism:** `next/font/google` exclusively — no self-hosted font files, no manual `@font-face`, no `<link>` tags.
- **`font-display`:** `swap` on both, set explicitly.
- **Preload:** `next/font` handles this automatically for fonts used in the root layout (both are) — no manual preload hints needed or missing.
- **Subsetting:** `['latin', 'latin-ext']` on both — correct for Romanian diacritics (ă, ș, ț, î, â).

**No font-related fix is needed in Phase B.**

---

## A.5 — Route-level chunk sizes

As noted in §A.1: Next.js 16 + Turbopack's `next build` **no longer prints a "First Load JS" table** (verified twice, full build log in this session's `build-baseline.log` — every one of the 108 routes prints only as `ƒ` with no size column). This is a tooling/version change, not something Buzomed's config suppressed — `next.config.ts` has no output customization that would hide it.

What I could measure directly instead: the shared root JS loaded on every route is **445 KB parsed / ~130 KB gzipped** (§A.1). I was not able to further attribute *additional*, route-specific JS for `/dashboard`, `/companies`, `/examinations` individually without either the incompatible analyzer or a browser-based Network tab recording — both unavailable here. This is a genuine gap in this diagnosis; if precise per-route numbers are wanted, running `next experimental-analyze` (without `-o`) on a machine with a browser is the correct next step, not re-attempting the webpack analyzer.

---

## A.6 — Third-party script cost

Only one third-party script exists (§A.2 Cause 4): Google Analytics `gtag.js`, loaded via `next/script strategy="afterInteractive"`, gated behind cookie consent. Transfer size and main-thread cost could not be measured directly (no browser), but `afterInteractive` is explicitly the non-render-blocking strategy, and the consent gate means a large fraction of first-time visitors never load it at all. `@vercel/speed-insights`'s own script is Vercel's own optimized, already-minimal beacon. **Neither is a meaningful lever for the LCP/CLS numbers in question.**

---

## Recommended fixes ranked by impact/effort

| # | Fix | Est. LCP impact | Est. CLS impact | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Add `sizes` to the `/` hero `<Image fill>`, and/or pre-resize `buzomed_picture.png` to a sane source resolution (it's currently portrait 2573×3638 being cropped into a landscape band — a properly cropped ~1920×1080 source would cut the origin file dramatically before Next.js optimization even runs) | **−1.5 to −2.5s** on `/` specifically (medium-high confidence — see §A.3 caveat) | 0 | 20-30 min | Low |
| 2 | Fix the `/dashboard`, `/companies`, `/examinations` `loading.tsx` skeletons to match real content's conditional structure and row counts (Pattern F4) | 0 | **−0.3 to −0.5** (high confidence — this is a code-provable, every-load mismatch on the 3 highest-traffic routes) | 45-60 min (three files, each needs care matching real conditional logic) | Low — purely presentational, no data/query changes |
| 3 | Add explicit `width`/aspect-ratio handling to `components/tenant-logo.tsx`'s raw `<img>` (currently `width: 'auto'`) | 0 | Small (−0.02 to −0.05, header-scoped element only) | 10 min | Low |
| 4 | Fix the `DashboardGreeting` server/client hydration mismatch (compute the hour server-side and pass it as a prop, or accept the mismatch is one-line text and suppress via a stable initial render) | 0 | Very small | 15 min | Low — but touches a component that intentionally wants the *visitor's* local hour, so the fix has to preserve that (can't just move `new Date()` fully server-side without changing behavior) |

**Nothing above touches Prisma queries, API routes, or the schema**, per the task's constraints — all four are presentation-layer only.

---

## Non-recommendations

Investigated and deliberately **not** recommending a change, with reasons:

- **`@next/bundle-analyzer` as permanent tooling** — confirmed incompatible with this project's Turbopack build; would silently no-op forever. Use `npx next experimental-analyze` instead when bundle investigation is needed again (no new dependency).
- **Lazy-loading `@react-pdf/renderer`, `xlsx`, `pdf-lib`** — already 100% server-only (API routes), never touch the client bundle. Nothing to lazy-load.
- **Lazy-loading `swagger-ui-react`** — already correctly done via `next/dynamic(..., { ssr: false })`, isolated to `/api-docs` only.
- **Lazy-loading `papaparse`** — legitimately client-bundled for its one actual use (in-browser CSV parsing on the import page), and small enough (~20KB gzip) not to be worth the added complexity of a dynamic import for a single, always-needed-on-that-route dependency.
- **Removing/changing the Google Analytics script** — already using the least-invasive loading strategy available (`afterInteractive`, consent-gated). Not a CWV lever.
- **Migrating fonts to `next/font`** — already done; nothing to migrate.
- **Adding `<Suspense>` boundaries to stream partial content on `/dashboard` / `/examinations`** — real, previously-documented (`performance-audit-report.md` §7) architectural gap that would likely help LCP on the authenticated app, but it's explicitly out of scope for a "presentation-layer only, don't touch data-fetching shape" Phase B, and the prior audit already flagged it as "needs a deliberate restructuring pass, not a mechanical fix" for the same correctness reasons (tightly interdependent derived data within one async function). Recommend as a **separate, future** follow-up, not part of this PR.
- **Investigating whether Speed Insights' aggregate numbers are skewed by real-world device/network variance** — Speed Insights is real-user field data across all devices and connections, including slower mobile networks common outside major Romanian cities. It's possible some tail latency reflects genuine network conditions rather than anything fixable in code. Worth keeping in mind when judging Phase B's real-world impact (item (f) in the Phase B report), not a reason to skip the fixes above.

---

## Summary

- **(a) Top 3 CLS causes:** (1) `loading.tsx` skeleton/content mismatches on `/dashboard`, `/companies`, `/examinations` — verified by direct code comparison, fires on every fresh load; (2) missing width reservation on `tenant-logo.tsx`'s raw `<img>` — small, header-scoped; (3) `DashboardGreeting` SSR/hydration timezone mismatch — small, text-only.
- **(b) Top 3 LCP causes:** (1) oversized/uncropped hero image with no `sizes` constraint on `/` — high confidence, code-verified (2573×3638px, 886KB source); (2) no `<Suspense>` streaming anywhere in the authenticated app, so LCP on `/dashboard`/`/companies`/`/examinations` is coupled to the slowest of several parallel Prisma queries — medium confidence, previously documented, out of scope for this PR; (3) no other meaningful LCP lever found — bundle size, fonts, and third-party scripts are all already in good shape.
- **(c) Bundle size:** 3.62 MB total client JS across 72 chunks app-wide; only 445 KB parsed / ~130 KB gzipped loads on every route (React 19 + Next runtime + root client components); largest single chunk (1.18 MB, `swagger-ui-react`) is correctly isolated to `/api-docs` only. Per-route "First Load JS" table is unobtainable from this Next.js/Turbopack version's tooling (see §A.5) — a real limitation of this diagnosis, not a Buzomed misconfiguration.
- **(d) Fonts:** Manrope + Fraunces, both via `next/font/google`, `latin`+`latin-ext` subsets, `display: swap`. Already correct — no change needed.
- **(e) Images without explicit dimensions:** 1 (`components/tenant-logo.tsx`'s raw `<img>`, partially mitigated by its wrapper's explicit height). Everything else already uses `next/image` with explicit `width`/`height` or `fill` inside an explicitly-sized container.
- **(f) Third-party scripts:** 1 — Google Analytics `gtag.js`, `next/script strategy="afterInteractive"`, consent-gated. Not a meaningful cost.
- **(g) Phase A complete. Awaiting user approval before Phase B.**

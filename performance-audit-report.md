# Performance Audit Report — 2026-07-10

Scope: `app/`, `lib/`, `prisma/schema.prisma`, `next.config.ts`, DB connection config. Method: direct code reading + 3 parallel research sweeps (index-vs-query-filter audit, N+1/fan-out audit, include/select over-fetch audit), all evidence-cited to file:line. No load testing was run — findings are static-analysis-based (query shape, index coverage, round-trip counts), not measured latency.

Legend: **Impact** = high/medium/low. **Bucket** = `SAFE` (applied in this batch) or `SIGN-OFF` (proposed only, not implemented — changes UX, adds schema/index write-cost, or touches correctness-sensitive write paths).

---

## 1. Database connection pooling — CHECKED, WAS ALREADY CORRECT (one gap fixed)

**Impact: high (if it had been wrong) / medium (the gap that was found). Bucket: SAFE — applied.**

The doc flagged this as the highest-priority thing to verify. Good news: the core setup was already correct.

- `prisma/schema.prisma` datasource block: `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`. Prisma only ever uses `directUrl` for `prisma migrate`/`db push` — **never at runtime**. Confirmed the one Prisma client used by every live route (`lib/prisma.ts`, `export const prisma = new PrismaClient()`) connects via `DATABASE_URL` only.
- `.env.local` / `.env.example`: `DATABASE_URL` pointed at `aws-1-eu-central-1.pooler.supabase.com:6543` with `?pgbouncer=true` — the correct PgBouncer transaction-mode pooler port. `DIRECT_URL` pointed at the same pooler host on port `5432` (Supabase's session-mode pooler, used as a documented IPv6-connectivity workaround per `lib/prisma.ts`'s own status notes) — not actually a raw direct connection, but that's fine since it's migration-only.
- **Gap found and fixed:** neither URL had `connection_limit` set. On serverless (Vercel), each function instance instantiates its own `PrismaClient`, and without `connection_limit`, Prisma defaults to `num_cpus * 2 + 1` connections per instance. Under concurrent request load, many simultaneously-cold function instances can collectively open far more connections than PgBouncer's pool has budget for — the textbook cause of intermittent timeouts on Prisma+Supabase+Vercel stacks. This matches the "intermittent slowness under concurrent load" symptom described in the batch brief.
- **Fix applied:** added `&connection_limit=1` to `DATABASE_URL` in `.env.local` and `.env.example`, per [Prisma's own PgBouncer guidance](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer).
- **Action needed from Colin:** this repo's `.env.local`/`.env.example` are both gitignored (not tracked), so this fix only affects local dev. **The production `DATABASE_URL` in Vercel's project environment variables needs the same `connection_limit=1` appended** — I have no access to the Vercel dashboard to do this myself.

---

## 2. `app/(authenticated)/dashboard/page.tsx` — dead query + stray sequential await

**Impact: medium (most-visited page in the app, per its own file comment). Bucket: SAFE — applied.**

Two bugs found in the same `Promise.all` block (lines 42-148, pre-fix):

1. **Dead, mislabeled query.** `thisMonthTotal` was computed inside the `Promise.all` (filtered by `todayStart`/`todayEnd` — i.e. it actually counted **today's** examinations despite being named/commented "this month's total") and then **never referenced anywhere in the JSX**. Confirmed via `grep -n "thisMonthTotal"` — only the destructuring line matched, no usage.
2. **Stray sequential await.** A *second*, correctly-computed `thisMonthExams` count (using `monthStart`) ran as a standalone `await` **after** the `Promise.all` resolved, with zero data dependency on anything inside it (`monthStart` is computed independently of `user.tenantId`, `tenant`, or any other destructured value) — this is exactly the pattern the audit brief pre-flagged.

**Fix applied:** deleted the dead `thisMonthTotal` query entirely; moved the real `thisMonthExams` query into the `Promise.all` array (computing `monthStart` up front alongside `todayStart`/`todayEnd`). Net effect: this page now issues one fewer total query on every single load (was 2 separate examination-count queries doing overlapping work — one wasted, one blocking — now 1 query, fully parallel with the rest).

---

## 3. `app/(authenticated)/examinations/page.tsx` — recall-count fan-out (the known example) + a second collapsible pair

**Impact: medium. Bucket: SAFE — applied.**

- **The known issue:** `ScadenteView`'s horizon sub-tabs (Scadențe/thisWeek/thisMonth/next3Months/all/overdue counts) ran as `Promise.all(VALID_HORIZONS.map(async (h) => { ... await prisma.recall.count(...) }))` — **5 separate round trips**, all with the same base filter (`status in [pending, overdue]`, `deletedAt: null`, same OR-filter) differing only by a `dueDate` range slice (and, for `overdue`, a status narrowing).
  **Fix applied:** replaced with a single `prisma.recall.findMany({ select: { status: true, dueDate: true }, where: {...same base filter, tenant-wide, no companyId...} })`, then bucket all 5 horizon counts in memory from that one result set. Preserves the original semantics exactly, including the detail that horizon counts are **tenant-wide** (never company-filtered) while the recall list itself can be — verified this distinction before writing the fix and preserved it.
- **A second instance of the same shape**, one level up in the same file: the tab-count row for the page's top-level tabs (Scadențe/Programate/În curs/Finalizate/Toate) ran `prisma.recall.count({status: {in:[pending,overdue]}})` and `prisma.recall.count({status: 'overdue'})` as two separate calls differing only by `status`.
  **Fix applied:** collapsed into one `prisma.recall.groupBy({ by: ['status'], ... })`, deriving both `scadenteCount` (sum) and `overdueScadenteCount` (the overdue bucket) from the single result.

Net: this page went from **7 recall-related round trips down to 2** (1 groupBy + 1 findMany), on top of the `examination.groupBy` it already had correct.

---

## 4. `app/(authenticated)/super-admin/tenants/[id]/page.tsx` — same recall-count pair

**Impact: low-medium (super-admin only, lower traffic than the customer-facing pages above, but same fix shape). Bucket: SAFE — applied.**

Same pattern as #3's second instance: `prisma.recall.count({status:'overdue'})` and `prisma.recall.count({status:'pending'})` as two of the eight parallel queries in this page's `Promise.all` (lines 74-108, pre-fix). Collapsed into one `prisma.recall.groupBy({by:['status'], where:{..., status:{in:['overdue','pending']}}})`, deriving both counts from the result. `Promise.all` array went from 8 entries to 7.

Note: this page's other four `examination.count` calls (total / this-month / this-week / signed-this-month) filter on **different columns** (`createdAt` with different ranges, `signedAt`) — not a clean `groupBy` candidate, left as-is (already parallel via `Promise.all`, which is correct).

---

## 5. `app/api/cron/subscription-check/route.ts` — two sequential per-invoice loops parallelized

**Impact: low-medium (runs once daily, not user-facing latency, but scales linearly with invoice count and this cron already does a lot of work in one run). Bucket: SAFE — applied.**

Two `for` loops, each iterating over independent `PlatformInvoice` rows (no cross-row shared state) and doing `await sendEmail(...)` + `await prisma.platformInvoice.update(...)` sequentially per invoice:
- The due-soon reminder loop (`dueSoonInvoices`)
- The overdue reminder loop (`overdueForReminder`)

**Fix applied:** both converted to `Promise.all(invoices.map(async (invoice) => {...}))`. Each iteration touches a distinct invoice row and an independent email send, so there's no correctness risk from concurrency here (unlike the loops discussed in §9 below, which share tenant-level state and were deliberately left alone).

**Not touched, for comparison:** the *first* loop in this same file (`overdueInvoices` — flips invoice status to `overdue` and conditionally transitions the tenant's `Subscription` to `past_due`) was left sequential. Multiple overdue invoices can belong to the same tenant, and that loop reads-then-writes the tenant's `Subscription` row; parallelizing it risks two iterations racing on the same subscription read before either writes (not catastrophic — both would just write the same idempotent result — but not obviously safe either, so left for a deliberate look rather than a mechanical fix). See §9.

---

## 6. Auth/session resolution — no per-request dedup (React `cache()` missing)

**Impact: high — this runs on every single authenticated page load and every API call. Bucket: SAFE — applied.**

`lib/auth.ts`'s `getCurrentUser()` (used by `requireUser()`/`requireRole()`) and `getApiUser()` each do, on every call: 1 Supabase Auth network round trip (`supabase.auth.getUser()`, which validates the JWT server-side — not just a local decode) + 1 Prisma query (`prisma.user.findUnique`).

The authenticated layout (`app/(authenticated)/layout.tsx:21`) already calls `requireUser()` once for every page under it. But **44 `page.tsx` files** under `app/(authenticated)/**` *also* call `requireUser()` or `requireRole()` themselves (confirmed via `grep -rl "requireUser()\|requireRole(" --include="page.tsx"`), on top of the layout's call. Neither `getCurrentUser` nor `getApiUser` was wrapped in React's `cache()`, so every one of those 44 pages was doing a **second full auth round trip** (Supabase network call + DB query) that produces an identical result to the layout's own call, within the same request.

**Fix applied:** wrapped both `getCurrentUser` and `getApiUser` in `cache()` from `'react'` — the standard, officially-documented Next.js App Router pattern for exactly this (per-request memoization of a data-fetching function, not cross-request caching — no staleness risk). Halves the auth-related round trips on every one of those 44 pages. As a side benefit, the lazy `lastLoginAt`/login-audit-log side effect inside `getCurrentUser` (previously could fire more than once per request if called multiple times) is now guaranteed to run at most once per request.

---

## 7. Rendering strategy — no Suspense anywhere, no ISR/revalidate anywhere (report only)

**Impact: medium. Bucket: SIGN-OFF (report only) — see note below on why this wasn't touched.**

- `grep -rln "export const dynamic\|export const revalidate"` across `app/` → **zero matches**. Every page is implicitly fully dynamic (all of them read cookies via Supabase's `createClient()` for auth, which forces dynamic rendering regardless). This is **not actually a missed opportunity for most pages** — tenant-scoped data genuinely can't be cached across requests/users. The doc's example of reference data that *could* tolerate ISR (plan lists, examination-type reference tables) exists but is fetched inline alongside per-request tenant data on the same pages, so splitting it out would require restructuring those pages into separate cached sub-fetches — a real change, not a one-liner.
- `grep -rln "Suspense" --include="*.tsx" app/` → **zero matches**. No page anywhere streams a slow section independently; every page blocks its entire render on its slowest query.

**Why this is reported but not implemented:** every heavy list page I read this session (`examinations/page.tsx`, `dashboard/page.tsx`, the super-admin tenant detail page) computes tightly interdependent data in one big async function — e.g. in `examinations/page.tsx`, `visibleRecalls` (derived from the main recall query) feeds into `companySummary`, which feeds into the JSX in several places. Slicing out a genuinely independent, non-critical section to wrap in its own `<Suspense>` boundary requires restructuring these into separate async sub-components — doable, but not the kind of "obviously safe, mechanical" change this batch's safe-fix bucket describes ("as long as it doesn't change what data is shown, only when it appears" is easy to violate by accident during a rushed restructure). Recommend picking 1-2 concrete pages for a follow-up Suspense pass with a bit more time, rather than doing it hastily across the board here.

---

## 8. Bundle composition — checked, no issues found

**Impact: n/a (clean). Bucket: n/a — nothing to fix.**

- `next.config.ts`: `serverExternalPackages: ["@prisma/client", "@react-pdf/renderer"]` already correctly excludes both from client bundling.
- Checked every genuinely heavy dependency in `package.json` (`xlsx`, `papaparse`, `pdf-lib`, `@pdf-lib/fontkit`, `swagger-ui-react`) for accidental client-bundle inclusion:
  - `xlsx` (`lib/hr-export/service.ts`) — imported only by two `app/api/**/route.ts` files. Server-only. Clean.
  - `pdf-lib` / `@pdf-lib/fontkit` (`lib/examinations/pdf-fill.ts`) — imported only by one `app/api/**/route.ts` file. Server-only. Clean.
  - `papaparse` (`lib/employees/import-parser.ts`) — imported by `app/(authenticated)/employees/import/import-client.tsx`, a `'use client'` component. This one **is** in the client bundle, but legitimately so — it parses a user-uploaded CSV in the browser before staging the import, which is the actual feature. Papaparse is lightweight (~20kb gzipped) relative to the others. Not a finding.
  - `swagger-ui-react` (`app/(public)/api-docs/page.tsx`) — the single heaviest client package in the repo, but it's already lazy-loaded correctly via `next/dynamic(() => import('swagger-ui-react'), { ssr: false })`, so it's code-split into its own chunk, only fetched by visitors of `/api-docs`. Correct pattern already in place.
- No MediaPipe or other unexpected heavy package found anywhere in the codebase.
- No `@next/bundle-analyzer` is installed, so I couldn't get exact per-route JS-shipped numbers — the `next build` route-size summary output doesn't flag any route as an outlier, but if precise client-bundle-size tracking over time is wanted, adding `@next/bundle-analyzer` would need a `next.config.ts` change and is a reasonable low-risk follow-up (didn't add it in this pass since it wasn't requested and installing new tooling deserves its own review).

---

## 9. N+1 / sequential-loop findings — reported, not touched (correctness-sensitive)

**Impact: varies (see below). Bucket: SIGN-OFF — these all involve either unbounded scale or write-path correctness, not mechanical fixes.**

Full sweep of `app/` and `lib/` for `await prisma.*` inside `for`/`.forEach` loops (beyond the ones already fixed above):

| File:line | What it does | Why not fixed here |
|---|---|---|
| `app/api/employees/import/commit/route.ts:197` | Per-row (capped at 500) sequential company/workplace/assignment find-or-create + a create-transaction, with per-batch caching already in place for company/workplace lookups | Race-condition-aware find-or-create logic (dedup on concurrent create) — parallelizing rows risks duplicate-company/workplace races that the current sequential+cache design avoids. Needs a deliberate concurrency review, not a mechanical `Promise.all` wrap. |
| `app/api/employees/bulk-assign-workplace/route.ts:54` | Per-employee (**no batch cap**) sequential transaction: find employee → close old assignment → create new one | **Flagging the missing cap as the real issue** — an admin could in principle select a very large employee set. Also a write-path correctness concern for parallelization (see below). |
| `app/api/examinations/bulk-schedule/route.ts:447,545` | Per-item (capped at 200) sequential transaction, each internally retrying to allocate a unique examination sequence number | Inherent to needing a strictly-increasing per-tenant sequence number — fixing this well means pre-allocating a block of sequence numbers in one transaction, which is a real design change to the numbering scheme, not a one-line fix. |
| `app/api/admin/check-retention/route.ts:19` | Per-tenant (unbounded, scales with customer count) sequential `Promise.all([examination.count, document.count])` + conditional `findFirst` | Admin/reporting tool, low traffic, lower priority; flagging for awareness as the tenant base grows. |
| `lib/webhooks/deliver.ts:28` | Per-webhook-endpoint (typically very few per tenant) sequential fetch + transaction | Low iteration count in practice; not worth the complexity of parallelizing outbound webhook delivery (retry/failure semantics get trickier under concurrency). |
| `app/api/cron/subscription-check/route.ts` (first loop, `overdueInvoices`) | Per-overdue-invoice: status flip + conditional `Subscription` transition + admin alert email | Multiple invoices can share a tenant, and this loop reads-then-writes the tenant's `Subscription` row — parallelizing risks a benign-but-real race (two iterations reading `status==='active'` before either writes). Left sequential deliberately (contrast with the two loops in the same file that *were* parallelized in §5, which don't share row-level state). |

None of these are "safe to apply directly" under the batch's own rules — they're either unbounded-scale flags (worth a decision on whether to add a cap) or touch write-path concurrency semantics that need a deliberate look, not a mechanical loop→Promise.all conversion.

---

## 10. Index coverage vs. actual query filters — reported, not touched (schema/index changes need sign-off)

**Impact: low-medium at current data volume, will matter more as tenants accumulate history. Bucket: SIGN-OFF — no index changes made.**

Full audit of every `Employee`/`Company`/`Workplace`/`Contract`/`Invoice`/`PlatformInvoice` query filter combination actually used in the codebase, compared against the schema's existing indexes on those models. (`Recall`/`Examination` were pre-confirmed fine by the batch brief and re-verified in passing — not re-audited here.)

**Cross-model pattern, found on 4 of the 6 models (Employee, Workplace, Contract, Invoice):** each has a lone single-column `@@index([companyId])` that is **never queried standalone** anywhere in the codebase — every real query pairs `companyId` with `tenantId` (and usually `deletedAt`). A tenant-leading composite (e.g. `[tenantId, companyId, deletedAt]`) would better match real usage than the current disjoint single-column indexes.

**Per-model summary:**

- **Employee** — hottest list/dashboard filter (`tenantId + isActive + archivedAt + deletedAt`, used in `lib/subscription.ts:31` billing seat-count and `dashboard/page.tsx`) has no directly-matching composite; only `[tenantId, archivedAt]` partially helps. `@@index([archivedAt])` (no tenantId) never used standalone — likely dead weight next to `[tenantId, archivedAt]`.
- **Company** — dominant pattern (`{id, tenantId, deletedAt}` ownership checks, ~11 call sites) is served by the PK, fine as-is. `@@index([cui])` is global/non-tenant-scoped but only ever queried as `tenantId + cui` together — should be `[tenantId, cui]` if changed.
- **Workplace — weakest-covered model of the six.** Only 2 single-column indexes (`tenantId`, `companyId`) against consistently 3-4-predicate real queries (`tenantId + companyId + deletedAt[+isActive]` is the dominant shape, ~7 call sites). No composite index exists for this model at all.
- **Contract** — `@@index([tenantId, status])` doesn't match any real query shape found (real status-filtered query is `companyId + tenantId + deletedAt + status:{in}`, which doesn't share a usable prefix with the existing index).
- **Invoice** — same `[tenantId, status]` mismatch as Contract; additionally, the regulatory-report queries (`reports/regulatory/page.tsx`, `reports/page.tsx`) filter `tenantId + deletedAt + status:{notIn} + issuedAt:{range}` with **no index touching `issuedAt`** — these are the most row-scanning Invoice queries found and currently fall back to `[tenantId]` + heap filtering.
- **PlatformInvoice** — best-covered of the six (the two unique composites match their numbering/dedup use cases well). `@@index([deletedAt])` alone is low-value (near-100% of rows have `deletedAt: null`, so it's never selective). The 3 cron sweep queries in `subscription-check/route.ts` filter `status + deletedAt` together — `[status]` alone doesn't fully cover that pairing.

**Why none of this was touched:** every fix here means either adding a new composite index (write-cost tradeoff on every insert/update to that table — explicitly called out in the batch brief as needing sign-off) or dropping an existing single-column index that, while apparently redundant against *current* code, could theoretically be relied on by a query I didn't find. None of these are "index A is a pure duplicate/prefix of already-existing index B" (which would have been safe to drop outright) — they're all "the existing index doesn't fully match the real filter shape," which is a reshape, not a cleanup, and reshapes need a decision on the added write cost.

**If/when this gets sign-off**, the highest-value single change is probably the Workplace composite (`[tenantId, companyId, deletedAt]`) — it's the only model with zero composite coverage at all against a clearly dominant multi-predicate query shape.

---

## 11. Real pagination — not implemented, per explicit instruction

**Bucket: SIGN-OFF, explicitly listed as needs-sign-off in the batch brief — not touched.**

Confirmed still present: `examinations/page.tsx` (`take: 200` for the list view, `take: 500` for the scadențe view) and likely other list pages have no `skip`/cursor/page param. Fine at current data volume per tenant; will need a product decision (page numbers vs. infinite scroll vs. just raising the limit) before this becomes a real ceiling. Not re-audited exhaustively beyond re-confirming the known example, per the brief's instruction to report-only on this item.

---

## 12. Over-fetching (`include`/`select`) — audited and trimmed

**Impact: medium-high on the two highest-traffic list views (`examinations/page.tsx`, `app/api/examinations/route.ts` — full clinical JSON blobs on every one of 200 rows). Low-medium elsewhere. Bucket: SAFE — applied, but verified field-by-field against actual render usage before trimming (not blind).**

Swept all 23 `include:` occurrences across 15 `app/(authenticated)/**/page.tsx` files, plus a spot-check of the busiest `app/api/**` list/detail routes, for relations pulled wholesale (`relation: true` or an `include` with no `select`) where the page's own JSX — and, where the value was passed to a child component, the child's actual prop usage — never touches most of the fetched fields. Every finding below was independently re-verified against the render code (not taken on faith from the audit sweep) before being trimmed; one gap in that verification was caught by the TypeScript compiler (`createdAt`/`verdict` were actually used in `workplaces/[wid]/page.tsx` — added back in before the build passed).

**Fixed:**

| File:line | Was fetching | Now selects | Why |
|---|---|---|---|
| `settings/billing/page.tsx:26` | `include: { items: true }` (all `PlatformInvoiceItem` fields) | Dropped entirely — `items` was never read anywhere in the file | Fully dead relation fetch on every billing-page load |
| `companies/[id]/invoices/[iid]/edit/page.tsx:29-32` | Full `InvoiceItem` rows via bare `include` | `description, quantity, unitPrice` only | Only these 3 fields feed `initialItems` for the form |
| `companies/[id]/workplaces/[wid]/page.tsx:45-62` | Full `EmployeeWorkplaceAssignment` rows | `id, startDate` + scoped `employee` select (already tight) | Rest (`tenantId`, `endDate`, `reasonForChange`, `notes`, timestamps, etc.) never rendered |
| `companies/[id]/workplaces/[wid]/page.tsx:65-86` | Full `Examination` rows (all clinical JSON) for 10 rows | `id, examinationNumber, status, verdict, signedAt, scheduledAt, createdAt` + tight relation selects | Same "recent exams" list pattern as below |
| `employees/[id]/page.tsx:93-107` | Full `Examination` rows for 10 rows | `id, examinationNumber, status, verdict, signedAt, scheduledAt, createdAt` + tight relation select | Clinical blobs (`anamnesis`, `vitalSigns`, `visionTest`, `hearingTest`, `lungFunction`, `additionalTests`, `maternityRisk`, `diagnoses`, `clinicalFindings`, `recommendations`, `notes`) never rendered on this summary list |
| `examinations/[id]/page.tsx:42-60` | `employee: true`, `examinationType: true`, `workplace: { include: { company } }` (all full) | `employee`: 5 fields; `examinationType`: 3 fields; `workplace`: 6 fields + company. Verified against `RiskProfileGlanceCard`'s actual prop usage (structurally-typed component, only reads `riskProfile`/`riskAssessmentSignedByCompany`/`riskAssessmentSignedAt`), not just this page's own JSX | Top-level `Examination` scalars (the clinical fields) were **left untouched** — this is the edit page, `ExaminationForm` genuinely needs the full record |
| `examinations/[id]/fisa/page.tsx:44-65` | `tenant: true`, `employee: true`, `workplace: { include: { company: true } }`, `examinationType: true`, `location: true` (all full) | `tenant`: 2 fields; `employee`: 4 fields; `workplace`: `name, department` + `company: {name, cui}`; `examinationType`: 2 fields; `location`: 4 fields | Biggest single-file offender — 5 fully-wide relations on the printable fișa document, each rendering only a handful of fields |
| `examinations/page.tsx:950-969` (`ExaminationsListView`, `take: 200`) | No top-level `select` — full clinical JSON payload × 200 rows on every list page load | Added top-level `select`: `id, examinationNumber, status, scheduledAt, startedAt, completedAt, signedAt` + existing (already-tight) relation selects | Highest row-count instance of the pattern — 200 rows of unused JSONB per page load |
| `app/api/examinations/route.ts:70-93` (`GET`, no active consumer found in this codebase) | Same full-clinical-JSON pattern, `take: 200` | Same trim as above + `verdict`, `createdAt` | Confirmed via `grep` that no client-side code currently calls this GET endpoint — zero risk of breaking a hidden field dependency; trimmed for whoever adds a consumer next |
| `super-admin/page.tsx:54-69` | No top-level `select` on `Tenant` (all ~30 columns incl. JSON `settings`/`featureFlags`, GDPR timestamps, `cnpHashSalt`) for every tenant | `id, name, isDemo, city, subscriptionStatus, createdAt` | `subscriptionTier` in particular is now fully dead here too (superseded by the real `Subscription`-based badge added in the tenant-creation-dropdown batch) |

**Checked, no fix needed** (relation selects already reasonably scoped): `companies/[id]/contracts/[cid]/edit/page.tsx`, `companies/[id]/contracts/[cid]/page.tsx`, `companies/[id]/invoices/[iid]/page.tsx`, `companies/[id]/page.tsx`, `companies/[id]/workplaces/[wid]/edit/page.tsx`, `super-admin/tenants/[id]/page.tsx` (most of its ~30 `Tenant` fields actually are rendered), `team/page.tsx`, `app/api/recalls/route.ts`, `app/api/examinations/[id]/route.ts` (intentionally full-record — hydrates the edit form).

---

## Summary

**Applied (safe fixes, verified with `tsc --noEmit` + `npm run build`, both clean):**
1. `connection_limit=1` added to `DATABASE_URL` (local `.env.local`/`.env.example` — **production Vercel env var still needs this manually**)
2. `dashboard/page.tsx` — removed 1 dead query, merged 1 stray sequential await into `Promise.all`
3. `examinations/page.tsx` — 7 recall round trips → 2 (1 groupBy + 1 findMany replacing a 5-way fan-out)
4. `super-admin/tenants/[id]/page.tsx` — 2 recall counts → 1 groupBy
5. `cron/subscription-check/route.ts` — 2 sequential per-invoice loops → parallel
6. `lib/auth.ts` — `getCurrentUser`/`getApiUser` wrapped in React `cache()`, halving auth round trips on 44 pages that call it twice per request
7. 9 `include`/`select` over-fetch trims across 8 files (§12) — the two biggest wins are `examinations/page.tsx`'s 200-row list and `app/api/examinations/route.ts`, both of which were shipping full clinical JSONB payloads (anamnesis, vital signs, lab results, etc.) on every row of every list load instead of the handful of summary fields actually rendered

**Reported, needs a decision before implementing:**
- Suspense boundaries (restructuring risk, no page had an obviously safe slice)
- N+1 loops in employee import / bulk workplace assignment / bulk examination scheduling (write-path concurrency correctness)
- Index reshapes on Employee/Company/Workplace/Contract/Invoice (write-cost tradeoff)
- Real pagination (UX decision)

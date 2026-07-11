# BATCH — Performance audit (report first, then apply only the safe fixes)

## Goal

Some pages feel slow. Do a real audit, not guesswork — produce a written report of findings with evidence (file, line, why it's a problem, estimated impact), then apply only the fixes marked "safe to apply directly" below. Anything that changes UX (e.g. real pagination) gets proposed in the report but NOT implemented without separate sign-off — it needs a product decision, not just a code change.

## Context already known (don't re-discover, verify and go deeper)

- `Recall` and `Examination` already have composite indexes matching their common filter patterns (`tenantId, dueDate, status` / `tenantId, status`) — indexing is not obviously the bottleneck, but audit other frequently-queried models (`Employee`, `Company`, `Workplace`, `Contract`, `Invoice`, `PlatformInvoice`) the same way: for each model, list its actual query filters across the codebase and check whether an index backs the combination actually used, not just individual columns.
- `app/(authenticated)/examinations/page.tsx`: the recall horizon counts (today/this week/this month/overdue etc.) run as N parallel `prisma.recall.count()` calls, one per horizon, instead of a single `groupBy`. Same shape may exist elsewhere — search for `.map(async` immediately followed by a `prisma.*.count(` or `.findFirst(` inside, across `app/` and `lib/`.
- List pages (`examinations/page.tsx`, likely others) use `take: 200` / `take: 500` with no real pagination (no `skip`/cursor, no page param) — fine at current data volume, will degrade as tenants accumulate history. Report this, don't fix it yet.
- Verify whether `DATABASE_URL` (and any `DIRECT_URL` used for migrations) is correctly split between the pooled Supabase connection (port 6543, PgBouncer) for the app's runtime queries and the direct connection (port 5432) only for migrations. If the app is running all query traffic through the direct connection, that's a likely major cause of intermittent slowness/timeouts under concurrent load on Vercel's serverless model — flag this as the highest-priority finding if confirmed, it's a one-line env var fix with outsized impact.

## What to audit

**1. Database access patterns**
- Every `findMany`/`findFirst` across `app/` and `lib/`: check for `include` blocks that pull more relations/fields than the page actually renders (over-fetching). Prefer `select` with only needed fields where the include is broad.
- Any loop (`for`, `.map`, `.forEach`) containing an `await prisma.*` call — true N+1 (sequential), not just a parallel fan-out. Flag sequential ones as high priority, parallel fan-outs (like the recall horizon counts) as medium priority (still worth collapsing into `groupBy`/`aggregate` where straightforward).
- Server component pages doing sequential `await` calls where the results don't depend on each other — should be `Promise.all`. `dashboard/page.tsx` has one such case already (a `thisMonthExams` count fetched after the main `Promise.all` block instead of inside it) — check for the same pattern elsewhere.

**2. Rendering / Next.js specifics**
- Which pages are fully dynamic (`export const dynamic = 'force-dynamic'` or equivalent via `cookies()`/`headers()` usage) vs. could tolerate `revalidate`/ISR for parts of the data that don't change per-request (e.g., plan lists, examination type reference data).
- Whether heavy list pages use `<Suspense>` boundaries to stream in slower sections (e.g., recall counts) while the rest of the page renders, instead of blocking the whole page on the slowest query.
- Check `next.config.ts` — `serverExternalPackages` already correctly excludes `@prisma/client` and `@react-pdf/renderer`. Verify no other heavy server-only package (PDF/image processing, MediaPipe if referenced anywhere in this repo, etc.) is being bundled into the client by mistake — check the client bundle output (`next build` stats or `@next/bundle-analyzer` if available) for unexpectedly large client chunks.

**3. Middleware / auth overhead**
- Check whatever runs on every authenticated request (likely a middleware or a `requireUser()`/`getApiUser()` call pattern) for redundant DB round-trips — e.g., re-fetching the full user + tenant + subscription on every single page/API call when some of that could be cached per-request (React `cache()` dedup) or carried in the session/JWT instead of re-queried.

**4. Supabase connection pooling** (see context above) — confirm pooled vs. direct connection usage, and check the Prisma `connection_limit` / `pool_timeout` params on the datasource URL are sane for a serverless deployment (Prisma docs recommend low `connection_limit` per serverless function instance when using PgBouncer in transaction mode).

## Deliverable

A short written report (as a markdown file in the repo or in your summary, your choice) listing each finding with: file/line, what's wrong, estimated impact (high/medium/low), and whether it's in the "safe to apply now" or "needs product sign-off" bucket.

## Safe to apply directly, no sign-off needed

- Fixing the connection pooling/env var issue, if confirmed
- Collapsing parallel per-item count fan-outs into a single `groupBy`/`aggregate` where the query logic allows it cleanly
- Moving any stray sequential `await` into an existing `Promise.all` block where results are independent
- Trimming `include`/`select` over-fetching on read-only list/detail pages where it's unambiguous the extra fields aren't rendered
- Adding `<Suspense>` around genuinely slow, non-critical sections of a page (e.g., secondary stat counts) so the rest of the page isn't blocked — as long as it doesn't change what data is shown, only when it appears

## Needs sign-off — propose only, do not implement

- Real pagination on list pages (changes UX: page numbers vs. infinite scroll vs. just raising/lowering the `take` limit — needs a decision)
- Any caching/ISR strategy that could serve stale data (needs to confirm acceptable staleness window per page)
- Any schema/index changes beyond what's clearly redundant with existing indexes (new indexes have write-cost tradeoffs worth flagging, not silently adding)

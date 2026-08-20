# List-Rendering Audit — 2026-08-20

Diagnostic-only pass, no functional changes. Goal: inventory every list-rendering surface in `app/` and `components/` driven by database rows, and identify which are actually large enough to justify virtualization — before we spend a batch adding `@tanstack/react-virtual` to lists that don't need it.

**Method:** `grep -rn "\.map("` across `app/` and `components/` (`*.tsx`) found **358 `.map()` calls across 120 files**. Five parallel research passes (split by domain: employees/HR, companies, examinations/recalls, reports/admin/settings, shared components) read every file, classified each `.map()` as trivial-skip or DB-driven, and for the latter recorded entity, UI structure, `key` correctness, existing pagination (component-side and query-side), and per-row render cost. This document is the synthesis of those five passes plus this codebase's own prior [`performance-audit-report.md`](../../performance-audit-report.md) (2026-07-10 query-level audit — connection pooling, N+1s, over-fetching, index coverage), which already established several facts reused below (e.g. `examinations/page.tsx` pagination sizes, no `Suspense`/ISR anywhere, index-coverage gaps on Employee/Workplace).

Domain reality used throughout for "realistic max rows": a production tenant (occupational medicine cabinet) has **20-100 client companies, 500-2000 employees, thousands of examinations/year**.

---

## Summary

- **Total list-rendering surfaces found:** 358 `.map()` calls across 120 files
- **Considered individually (DB/dynamic-data-driven):** 46 — tabled below
- **Trivial / skipped** (fixed enums, small hardcoded config/nav/tab arrays, intrinsically-bounded domain lists under ~20 items): ~312, itemized by area in the [Skipped appendix](#skipped-appendix)
- **By size category** (of the 46 considered):
  - Very large (1000+ realistic rows): **2**
  - Large (200-1000): **10**
  - Medium (50-200): **9**
  - Small (<50, still worth a table row — mostly for the key-prop finding): **25**
- **Missing/no real pagination** (of the Medium+ lists): **13**
- **`key` prop issues found:** **3** real bugs (unstable/colliding keys), **3** cosmetic index-key uses (low risk, static or non-reorderable render) — see [§ Key bugs](#key-bugs-found-not-fixed)
- **Cross-reference with `slow_query_logs`:** table exists (added in the prior `feat/prisma-slow-query-logging` batch) but currently has **no data** — `SLOW_QUERY_LOG_ENABLED` is off by default and hasn't been enabled in any environment yet. No cross-reference was possible this round; re-run this step once 1-2 weeks of production data exists (see that PR's own recommended cadence in `docs/` or the dashboard itself).

---

## Priority-ranked table

Ranking rules: **P1** = very large lists OR wrong-key bugs. **P2** = large lists with no pagination. **P3** = medium lists with heavy per-row cost. **P4** = medium lists with correct pagination and cheap rows (defer).

| Priority | File | Entity | Est. max rows | Pagination | Key OK | Row cost | Recommended action |
|---|---|---|---|---|---|---|---|
| P1 | `components/iris/iris-panel.tsx:265` | Iris chat message | unbounded (session) | none | **no** — `id: Date.now().toString()`, can collide within the same ms | simple | Switch to `crypto.randomUUID()` for message ids; consider capping in-memory history for very long sessions. |
| P1 | `components/landing/LandingChat.tsx:315` | Public chat message | unbounded (session) | none (only the outbound API payload is capped, not the rendered list) | **no** — array index | simple | Switch to a stable id (increment counter or `crypto.randomUUID()`); lower urgency than Iris (public widget, short sessions). |
| P1 | `app/(authenticated)/companies/[id]/invoices/invoice-form.tsx:201` | Draft `InvoiceItem` (mutable, removable) | <20 | client state (small) | **no** — array index, and rows are user-removable (`removeItem`) | simple | Real correctness risk despite small size: removing a row with an index key can desync input focus/values from the wrong row. Give each draft line a stable client-side id at creation time. |
| P1 | `app/(authenticated)/employees/employees-bulk-table.tsx:182,268` | Employee (desktop table + mobile cards) | up to ~2000 | `take: PAGE_SIZE(100)` for 6/9 sort modes; **unbounded for `lastExam_*`/`recall_*`/`workplace_*` sorts** (pagination explicitly disabled for those) | yes (`e.id`) | medium | This is the single clearest virtualization candidate in the app. Either extend server-side pagination to cover all 9 sort modes (preferred — needs a design for sorting on computed/joined fields), or virtualize with `@tanstack/react-virtual` for the 3 unbounded modes specifically. |
| P1 | `app/(authenticated)/employees/import/import-client.tsx:1219` | `AnnotatedRow` (CSV import preview) | hundreds-to-thousands (bounded only by the uploaded file, up to the tenant's ~2000-employee cap) | none — full parsed file rendered, no `.slice()` | yes (`r.rowNumber`) | medium (per-row issue/warning arrays) | Virtualize this table — it's the one list in the app with no natural ceiling at all (a user can upload a 2000-row CSV and it renders in full immediately). Good first target for `@tanstack/react-virtual`, ~40-50px row height. |
| P2 | `app/(authenticated)/examinations/bulk/bulk-schedule-wizard.tsx:515` | `RecallItem` (employees-without-exam / recalls) | hundreds+ for a large company | none — full API response held in state, only `overflow-y-auto` CSS scroll | yes (`r.id`) | medium | Add server-side pagination or a search/filter-first UX to the wizard's item-selection step before virtualizing; hundreds of checkbox rows with per-row conditional cells is real DOM weight today. |
| P2 | `app/(authenticated)/companies/[id]/workplaces/[wid]/bulk-assign-employees.tsx:372` | Employee (checkbox list, "all" mode) | up to a company's full roster (could be hundreds) | "search" mode caps at `limit=50`; **"all" mode has no limit** | yes (`emp.id`) | simple | Cap "all" mode server-side too (reuse the 50-row limit + a "load more"/search nudge), or virtualize the list — currently only CSS `overflow-y-auto` hides the cost, it doesn't remove it. |
| P2 | `app/(hr-portal)/hr-portal/dashboard/hr-dashboard-client.tsx:264` + `page.tsx:97` | Employee (HR-portal filtered rows) | up to several hundred (scoped to the HR user's assigned companies) | none — `findMany` with no `take`, plus a second unbounded `examination.findMany` reduced in-memory | yes (`row.id`) | medium | Add `take`/pagination to the underlying employee query; this is customer-facing (HR portal users, not just staff) so worth prioritizing over some of the internal-tool items below. |
| P2 | `app/(authenticated)/reports/vaccinations/page.tsx:138` | Vaccination | unbounded — grows with date range selected | none — full date-range result set | yes (`v.id`) | simple | Add a `take` ceiling (or require a narrower default date range) — this is the one report page with a genuinely open-ended query shape (others are filtered to one horizon or a small company set). |
| P2 | `app/api/reports/company/[id]/pdf/company-report-pdf-document.tsx:175` | Worker (report row) | could be hundreds of exams for a full-year range | none | **no** — array index (low risk: react-pdf static server render, not interactive) | simple | Low urgency (server-rendered PDF, not a live DOM list) but worth a row cap or explicit pagination like the sibling `compliance-report-pdf.tsx` already does (chunked at 30 rows/page) if this report is used for large tenants. |
| P2 | `app/(authenticated)/settings/billing/billing-client.tsx:232` | PlatformInvoice (tenant's own billing history) | grows ~12/year, will reach hundreds over a multi-year tenant lifetime | none | yes (`inv.id`) | simple | Not urgent today, but add `take`/pagination before this becomes a real list — it has no natural ceiling and will only grow. |
| P2 | `app/(authenticated)/medical-events/page.tsx:116` | MedicalEvent | up to thousands over tenant lifetime | query has `take: 200` but **no `skip`/page param and no pagination UI** — events past the newest 200 are invisible with no way to reach them | yes (`ev.id`) | simple | This is a UX bug more than a size problem: data exists but is unreachable past row 200. Wire up the same `Pagination` component pattern already used correctly on `settings/audit-log` and `super-admin/system-health`. |
| P2 | `app/(authenticated)/_components/documents-list.tsx:281` (data from `documents-section.tsx:40`) | Document | up to hundreds per entity over time | query has `take: 100`, no `skip`, no client pagination | yes (`d.id`) | simple | Same unreachable-past-the-cap issue as medical-events above; same fix (wire real pagination). |
| P2 | `app/(authenticated)/super-admin/tenants/[id]/platform-invoices-tab.tsx:252,274` | PlatformInvoice (client-fetched) | grows with tenant age | client `fetch`, no limit param visible | yes (`inv.id`) | simple | Low traffic (super-admin only) but same shape as the billing-client finding above — add a limit param to the fetch. |
| P3 | `app/(authenticated)/examinations/page.tsx:740,829` (`ScadenteView`, desktop table + mobile cards) | Recall | **correctly paginated**, `SCADENTE_PAGE_SIZE = 100` | server `skip`/`take`, confirmed 100 (not 500 as the task brief assumed) | yes (`r.id`) | **heavy** — `recallPriorityBadge(getHazardMultiplier(riskProfile))` parses the JSONB risk profile and loops the full hazard schema **per row, on every render, and does it twice** (desktop table and mobile cards both render unconditionally, each independently recomputing the same badge) | Not a row-count problem — a wasted-computation one. Memoize the per-recall badge computation once per `visibleRecalls` array (`useMemo`), keyed by recall id, and share the memoized result between the desktop and mobile variants instead of recomputing twice. |
| P3 | `app/(authenticated)/examinations/new/new-examination-form.tsx:245` (options from `new/page.tsx:49`) | Workplace (native `<select>` options) | unbounded — `prisma.workplace.findMany` has no `take`/`skip` | none | yes (`wp.id`) | simple per-row, but a native `<select>` with hundreds of options degrades badly (scroll performance, screen-reader announce time) | Cap the query or switch to a searchable combobox (the codebase already has `components/ui/employee-search-combobox.tsx` as a precedent pattern) once workplace counts get large. |
| P4 | `app/(authenticated)/examinations/page.tsx:994` (`ExaminationsListView`) | Examination | correctly paginated, `LIST_PAGE_SIZE = 200` | server `skip`/`take` | yes (`e.id`) | simple | No action — correctly bounded, cheap rows. Defer. |
| P4 | `app/(authenticated)/settings/audit-log/page.tsx:97` | AuditLogEntry | correctly paginated, `PAGE_SIZE = 200` | server `skip`/`take` + `<Pagination>` wired | yes (`entry.id`) | simple | No action. Defer. |
| P4 | `app/(authenticated)/super-admin/system-health/page.tsx` (7 sections: errors, cron runs, AI usage, email, audit, imports, failed webhooks, retention) | SystemErrorLog / CronRun / EmailDelivery / AuditLogEntry / ImportJob / WebhookDelivery | correctly paginated, dedicated `*_PAGE_SIZE` per section (50/30/100/50/30/30/20) | server `skip`/`take` + `<Pagination>` wired on every section | yes on every list | simple | No action — this file is the model pagination pattern in the app (see recommendation below). Defer. |
| P4 | `app/(authenticated)/super-admin/slow-queries/page.tsx:360,412` | SlowQueryLog (aggregated + raw) | correctly bounded, `LIMIT 100` (agg, raw SQL) / `RAW_PAGE_SIZE = 50` (raw tab) | raw SQL `LIMIT` + server `skip`/`take` + `<Pagination>` on raw tab | yes (raw tab `log.id`); agg tab uses `${queryText}-${i}` — index-derived but paired with the text itself, stable enough for a server-rendered list that doesn't reorder mid-render | simple | No action. Defer. |
| P4 | `app/(authenticated)/companies/[id]/compliance/compliance-client.tsx:196` (`EmployeeList`) | Employee (compliance rows) | client-paginated, `PAGE_SIZE = 50` | client `.slice()` + search | yes (`emp.id`) | simple | No action — good existing client-pagination pattern. Defer. |

---

## Recommendations (P1/P2 detail)

Already written inline per row above; consolidated pointers:

1. **`employees-bulk-table.tsx`** — extend pagination to the 3 sort modes that currently bypass it, or virtualize just those modes.
2. **`import-client.tsx`** (CSV import preview) — virtualize with `@tanstack/react-virtual`, this is the one truly unbounded list in the app.
3. **`bulk-schedule-wizard.tsx`** — add pagination/search to the recall-selection step before virtualizing.
4. **`bulk-assign-employees.tsx`** "all" mode — cap it the same way "search" mode already is.
5. **HR portal dashboard** — add `take` to the employee/examination queries feeding it.
6. **`reports/vaccinations/page.tsx`** — add a `take` ceiling or a narrower default date range.
7. **`company-report-pdf-document.tsx`** — chunk like its sibling `compliance-report-pdf.tsx` already does.
8. **`settings/billing/billing-client.tsx`** and **`platform-invoices-tab.tsx`** — add pagination ahead of need (currently small, will grow).
9. **`medical-events/page.tsx`** and **`_components/documents-list.tsx`** — both have a hard `take` cap with *no* pagination UI to reach anything past it; wire the existing `<Pagination>` component (already proven correct on `settings/audit-log` and `super-admin/system-health`).
10. **`examinations/page.tsx` `ScadenteView`** — not a size fix, a `useMemo` fix: stop recomputing the hazard-multiplier badge twice per row.

---

## Non-recommendations

Investigated, explicitly **not** recommended for optimization, with reason:

- **`companies/page.tsx`** (Company list, table + mobile) — no pagination, but realistic max is 20-100 rows per tenant. Leave as-is; revisit only if the domain estimate changes.
- **`companies/[id]/page.tsx`** sublists (Workplace/Invoice/Contract) — all domain-bounded to small counts (≤50 workplaces, a few dozen invoices/contracts a year per company). No action.
- **`workplaces/[wid]/page.tsx`** employee-assignment and examination sublists — per-workplace scope, small; the examination sublist is already `take: 10`.
- **Per-employee sub-tabs** (`medical-events-tab.tsx`, `vaccinations-tab.tsx`) — bounded to one employee's own history. No action.
- **`intermediaries/page.tsx`** and **`intermediaries/[id]/page.tsx`** — typically a handful of intermediaries and their invoices per tenant. No action.
- **`super-admin/system-health/page.tsx`** and **`super-admin/slow-queries/page.tsx`** — already correctly paginated on every section (see P4 above); explicitly called out here so nobody re-flags them in a future pass wondering "why isn't this virtualized" — it doesn't need to be, it's already bounded.
- **`compliance-client.tsx` `EmployeeList`** and **`compliance-report-pdf.tsx`** — already have correct client-side pagination / PDF chunking respectively. Good patterns, not bugs.
- **`components/ai/InvestigationRecommender.tsx`** — key uses the AI-returned investigation name (`r.investigation`), not a DB id; theoretically non-unique if the model repeats itself, but the list is short (tied to hazard count) and this isn't a real observed problem. Noted, not actioned.
- **`components/ui/breadcrumbs.tsx`** — uses an index key, but breadcrumb depth is 2-4 items and never reorders. Cosmetic only, not worth a follow-up.
- **`app/api/super-admin/platform-invoices/[id]/pdf/platform-invoice-pdf-document.tsx`** — index key on invoice line items, but this is a static server-rendered PDF (react-pdf, no client reconciliation) — the failure mode a "wrong key" bug usually causes (incorrect re-mounts on reorder) cannot happen here.
- **`super-admin/page.tsx`** (Tenant list) — currently unbounded, but platform-wide tenant count is small today. Flagged for awareness, not actioned this round — revisit once the platform has meaningfully more tenants.

---

## Key bugs found (not fixed)

Per instructions, these are **documented only** — fix in a dedicated follow-up PR so the change can be attributed and tested on its own:

1. **`components/iris/iris-panel.tsx`** (lines ~108, 128, 133, 170, 178 for creation; line 265 for the render key) — message `id: Date.now().toString()`. Two messages created within the same millisecond get the same key, causing React to conflate them on re-render. Fix: `crypto.randomUUID()`.
2. **`components/landing/LandingChat.tsx:315`** — `key={i}` (array index) on chat messages. Fix: give each message a stable id at creation time, same as #1.
3. **`app/(authenticated)/companies/[id]/invoices/invoice-form.tsx:201`** — `key={idx}` (array index) on draft `InvoiceItem` rows that are user-removable via `removeItem`. This is the one index-key finding with a *real*, currently-live correctness risk (not just theoretical): removing a middle row can cause React to reuse the wrong row's DOM node, desyncing input focus/value from the row the user thinks they're editing. Fix: assign each draft line a stable client-side id (e.g. `crypto.randomUUID()`) at the moment it's added to state.

**Not counted as bugs** (index keys present but low/no real risk — static server render or non-reorderable short lists): `company-report-pdf-document.tsx:175`, `invoice-pdf-document.tsx:205`, `platform-invoice-pdf-document.tsx:171` (all react-pdf, static), `breadcrumbs.tsx:24` (tiny, never reorders).

---

## Cross-reference with slow query logs

`SlowQueryLog` (added in the prior `feat/prisma-slow-query-logging` batch, merged to `main`) exists as a table, but `SLOW_QUERY_LOG_ENABLED` has not been turned on in any environment yet, so the table currently holds no data. None of the queries feeding the lists above could be cross-referenced against real slow-query evidence this round.

**Once 1-2 weeks of production data exists**, the highest-value queries to check first (because they're the ones this audit already flagged as unbounded and DB-driven, not just render-heavy) are: `employees-bulk-table.tsx`'s unbounded sort-mode query, `bulk-schedule-wizard.tsx`'s recall-item fetch, the HR-portal dashboard's employee/examination queries, and `reports/vaccinations/page.tsx`'s date-range query. If any of these show up with high `p95`/`durationMs` in `/super-admin/slow-queries`, that's a signal the list is slow because of the *query*, not (only) because of unvirtualized rendering — worth fixing the query first per that dashboard's own optimization playbook, since a faster query may make virtualization unnecessary.

---

## Skipped appendix

Trivial `.map()` calls considered and excluded from the table above, by area (not exhaustive line-by-line — full detail was captured by each research pass; this is the aggregate):

- **Employees/HR** (~15 skipped): `<option>` maps over per-tenant company/workplace lists (small), `ASSIGNMENT_REASONS`/`ARCHIVE_REASONS` enums, skeleton-loading placeholder maps, import-client's column-key/file-header/example-table maps, employee/workplace search-combobox result lists (short, interactive).
- **Companies** (~14 skipped): role/reason enums, verdict-status tuples, date-range and month-name arrays, `RISK_PROFILE_SCHEMA` hazard categories, AI-generated briefing sections (small LLM output), workplace-form `examinationTypes` (system reference table, ~10-30 rows).
- **Examinations/Recalls** (~20 skipped): fixed vital-signs array (6 items), fixed verdict-status tuple (4 items), `MATERNITY_RISK_FACTORS`, all `SelectField` option arrays, `HORIZONS` (7 fixed tabs), wizard `sessions` (hard-capped at 10) and `previewItems` (sliced to 3), `StepIndicator` (3 steps), `examinationTypes`/`practitioners` (small tenant-scoped lists), `REQUEST_SOURCES`, all `loading.tsx` skeletons, `risk-profile-glance-card.tsx`'s fixed hazard-category map.
- **Reports/Admin/Settings** (~25 skipped): `ALL_DATE_RANGES`/`HORIZONS` selector maps repeated across every report page, all `loading.tsx` skeletons, `RISK_PROFILE_SCHEMA`-driven hazard rows on hazards/regulatory reports, practitioner lists (bounded by staff headcount), `monthlyTrend` (≤12 buckets), API-settings keys/scopes/events (small tenant config), team/invitation member lists (team-sized), tenant detail page's user list (team-sized), fixed option/preset arrays across several admin action components.
- **Shared components/misc** (~15 skipped): `app-nav.tsx`/`mobile-nav.tsx` (small page-count-sized nav arrays, confirmed not DB-driven), public landing page's hardcoded marketing content (workflow cards, stat cards, table rows), `dashboard/loading.tsx` skeletons, `HrExportButton`'s format list, `ContactForm`'s subject list, Iris/LandingChat's hardcoded starter-question and loading-dot arrays, `CaenHazardSuggestionCard`'s fixed hazard schema.

---

## Surprises / patterns worth naming

- **The app's pagination story is bimodal, not absent.** The task brief's framing ("before we start virtualizing blindly") suggested pagination might be missing everywhere — it isn't. `super-admin/system-health/page.tsx` and the `slow-queries` dashboard show the team already knows how to paginate correctly (dedicated page size + `skip`/`take` + the shared `<Pagination>` component, applied consistently across 9 different lists between the two files). The gap is that this pattern **wasn't propagated to the customer-facing high-volume pages** — `employees-bulk-table.tsx`, `bulk-schedule-wizard.tsx`, the HR portal — which is exactly backwards from a user-impact standpoint (internal admin tools are the best-paginated pages in the app; the pages actual customers use most are the least).
- **The two real virtualization candidates aren't where the task brief expected.** `examinations/page.tsx` — the file explicitly called out in the brief as "known to be large/complex" — turned out to be correctly paginated at both 100 and 200 rows. The genuinely unbounded lists are the CSV import preview and the 3 unpaginated employee-sort-modes, both less obvious than "the examinations page."
- **A wasted-computation bug masquerading as a size problem.** `ScadenteView`'s hazard-badge computation (P3 above) is the clearest example in this audit of the exact trap the task brief warned about: "wrong `key` props... [are] often the biggest render cost that people mistake for 'list is too large.'" Here it's not a key issue but the same category of mistake — a 100-row *correctly-paginated* list looks fine on paper, but does an expensive JSONB-parse-and-loop twice per row, twice per page load (desktop + mobile), which is the kind of cost profiling would catch and a "just virtualize it" fix would completely miss.
- **`take` without `skip` is a recurring half-measure.** `medical-events/page.tsx` and `_components/documents-list.tsx` both cap their query at a fixed `take` (200 and 100 respectively) but never expose a way to page past that cap — data silently becomes unreachable rather than slow. Worth a quick sweep for this exact pattern (`take: N` with no `skip`/`cursor` nearby) as a fast follow, since it's a correctness gap, not just a performance one.

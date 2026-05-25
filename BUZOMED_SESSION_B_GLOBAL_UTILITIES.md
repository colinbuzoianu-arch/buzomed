# Buzomed — Session B: Global Utilities

## What was built

Three global utilities that affect many screens across the app.

---

## Part 1 — lib/format-date.ts

Centralized date/time formatting. Replaces ~27 ad-hoc `new Intl.DateTimeFormat(...)` calls scattered across `app/(authenticated)/**`.

### Styles available

| Style | Output (ro-RO) | Output (en-GB) |
|---|---|---|
| `short` | 23.05.2026 | 23/05/2026 |
| `medium` | 23 mai 2026 | 23 May 2026 |
| `long` | joi, 23 mai 2026 | Thursday, 23 May 2026 |
| `datetime` | 23 mai 2026, 14:30 | 23 May 2026, 14:30 |
| `time` | 14:30 | 14:30 |
| `iso` | 2026-05-23 | 2026-05-23 |
| `relative` | acum 3 zile | 3 days ago |

### Exports

- `formatDate(value, style?, locale?)` — main utility, server & client safe
- `formatDateRange(from, to, locale?)` — collapses ranges sensibly ("23 – 28 mai 2026")
- `formatDateAuto(value, style?)` — client-only, auto-detects browser locale

### What was migrated

All `new Intl.DateTimeFormat(...)` calls in `app/(authenticated)/**` were migrated. Mapping used:
- `{ dateStyle: 'medium' }` → `'medium'`
- `{ dateStyle: 'medium', timeStyle: 'short' }` → `'datetime'`
- `{ dateStyle: 'long' }` → `'medium'` (same visual in ro-RO)
- `{ hour: '2-digit', minute: '2-digit' }` → `'time'`
- `toLocaleDateString(..., { weekday: 'long', day: 'numeric', month: 'long' })` in dashboard → `'long'` (now includes year)

### What was NOT migrated (intentionally)

- `app/api/examinations/[id]/fisa-pdf/route.ts` — server-only, PDF generation, byte-stable output
- `app/api/examinations/[id]/archive-fisa/route.ts` — same
- `app/api/examinations/[id]/documents/[docKey]/route.ts` — same
- `reports/page.tsx` monthFormatter `{ year: 'numeric', month: 'short' }` — no matching named style, kept as inline Intl (used for chart month labels)

### Files changed (formatter migration)

- `app/(authenticated)/_components/documents-list.tsx` — removed local `formatDate` function
- `app/(authenticated)/team/team-invite-section.tsx`
- `app/(authenticated)/team/page.tsx`
- `app/(authenticated)/recalls/bulk-schedule-modal.tsx` — used `formatDateAuto`
- `app/(authenticated)/reports/expiration/page.tsx`
- `app/(authenticated)/reports/regulatory/page.tsx`
- `app/(authenticated)/employees/page.tsx`
- `app/(authenticated)/employees/[id]/page.tsx`
- `app/(authenticated)/examinations/page.tsx` — two formatters (module-level + ScadenteView component)
- `app/(authenticated)/examinations/[id]/page.tsx` — medium + datetime
- `app/(authenticated)/examinations/[id]/fisa/page.tsx` — hardcoded 'ro-RO' + dateStyle:'long' → medium,'ro'
- `app/(authenticated)/super-admin/page.tsx`
- `app/(authenticated)/super-admin/tenants/[id]/page.tsx` — medium + datetime
- `app/(authenticated)/super-admin/tenants/[id]/tenant-invite-section.tsx`
- `app/(authenticated)/companies/[id]/page.tsx`
- `app/(authenticated)/companies/[id]/workplaces/[wid]/page.tsx`
- `app/(authenticated)/companies/[id]/contracts/[cid]/page.tsx`
- `app/(authenticated)/companies/[id]/invoices/[iid]/page.tsx`
- `app/(authenticated)/companies/[id]/annual-report/page.tsx`
- `app/(authenticated)/companies/[id]/report/page.tsx` — three formatters (module-level + WorkersTable + ExaminationsTable components)
- `app/(authenticated)/dashboard/page.tsx` — toLocaleDateString → formatDate long

---

## Part 2 — components/ui/breadcrumbs.tsx

Reusable breadcrumb component. Used on all detail/edit/new pages.

### API

```tsx
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/breadcrumbs'

<Breadcrumbs
  items={[
    { label: 'Companii', href: '/companies' },
    { label: 'Bigotti Romania', href: '/companies/123' },
    { label: 'Editează' },  // last item — no href, bold, aria-current="page"
  ]}
  className="print:hidden"  // optional
/>
```

### i18n keys added

In `messages/ro.json` and `messages/en.json` at `nav.*`:
- `nav.superAdmin` — "Super admin" / "Super admin"
- `nav.fisa` — "Fișă" / "Fitness certificate"

### Pages with breadcrumbs added

| Page | Trail |
|---|---|
| `/companies/[id]` | Companii › {company.name} |
| `/companies/[id]/edit` | Companii › {company.name} › Editează |
| `/companies/[id]/workplaces/[wid]` | Companii › {company.name} › {workplace.name} |
| `/companies/[id]/workplaces/[wid]/edit` | Companii › {company.name} › {workplace.name} › Editează |
| `/companies/[id]/workplaces/new` | Companii › {company.name} › Loc de muncă nou |
| `/companies/[id]/invoices/[iid]` | Companii › {company.name} › {invoice.invoiceNumber} |
| `/companies/[id]/invoices/new` | Companii › {company.name} › Factură nouă |
| `/companies/[id]/invoices/[iid]/edit` | Companii › {company.name} › {invoice.invoiceNumber} › Editează |
| `/companies/[id]/contracts/[cid]` | Companii › {company.name} › {contract.contractNumber} |
| `/companies/[id]/contracts/new` | Companii › {company.name} › Contract nou |
| `/companies/[id]/contracts/[cid]/edit` | Companii › {company.name} › {contract.contractNumber} › Editează |
| `/companies/[id]/annual-report` | Companii › {company.name} › Raport anual (print:hidden) |
| `/companies/[id]/report` | Companii › {company.name} › Raport (print:hidden) |
| `/employees/[id]` | Angajați › {lastName} {firstName} |
| `/employees/[id]/edit` | Angajați › {lastName} {firstName} › Editează |
| `/examinations/[id]` | Examinări › {lastName} {firstName} |
| `/examinations/[id]/fisa` | Examinări › {firstName} {lastName} › Fișă (inherited print:hidden from parent) |
| `/super-admin/tenants/[id]` | Super admin › {tenant.name} |

### Schema change: invoices/[iid]/edit

Added `company: { select: { name: true } }` to the Prisma include in `companies/[id]/invoices/[iid]/edit/page.tsx` to surface company name in the breadcrumb. No migration needed (just a query field addition).

---

## Part 3 — Toast redesign

### components/ui/sonner.tsx

- Position moved to `top-right`
- `closeButton` enabled
- `duration` set to 4500ms
- Icons colored with semantic CSS vars (`--accent-positive`, `--accent-warning`, `--accent-danger`)
- Toast body uses card background + custom shadow (`0 4px 12px -2px rgba(15,30,63,0.08)`)
- Font 13px medium title, 12px muted description
- Action button styled to match primary button
- CSS vars: `--normal-bg: hsl(var(--card))`, `--font-family: var(--font-sans)`

### lib/toast.ts

New exports:
- `toastInfo(message, description?)` — was missing
- `toastWarning(message, description?)` — was missing
- `toastUndo(message, options)` — success toast with "Anulează" action button, 6s default duration

Updated domain helpers (backward-compatible — old call sites with no `onUndo` work identically):
- `TOAST.companyDeleted(name, onUndo?)` — now accepts optional undo
- `TOAST.employeeArchived(name, onUndo?)` — now accepts optional undo
- `TOAST.examinationCancelled(onUndo?)` — now accepts optional undo
- `TOAST.recallCancelled(onUndo?)` — now accepts optional undo
- `TOAST.userArchived(name, onUndo?)` — now accepts optional undo

No call sites were modified — undo is opt-in for future use.

---

## Build status

```
✓ Compiled successfully in 41s
✓ TypeScript: no errors
✓ 55 pages generated
```

---

## Session B deferred

- Wire up `onUndo` callbacks to actual restore endpoints when soft-delete restore is implemented
- `reports/page.tsx` monthFormatter still uses inline `Intl.DateTimeFormat` (no matching named style)
- Consider adding `'monthYear'` style to `lib/format-date.ts` if needed for charts

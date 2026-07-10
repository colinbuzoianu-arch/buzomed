# BATCH — Remove Stripe, add manual flat + usage-based platform billing

## Context

Buzomed currently bills tenants (cabinets) via Stripe (recurring card subscription on 3 tiers: Starter/Growth/Pro, plus Enterprise for >2000 employees). This creates friction in sales conversations with Romanian medical practices, who expect to pay by bank transfer against a factura, not auto-charge on a card.

Goal of this batch:
1. Remove Stripe entirely as a payment method.
2. Keep the 4 existing flat-rate plans (starter/growth/pro/enterprise) exactly as they are today — same prices, same employee caps. Billing for these happens via the existing `PlatformInvoice` system (already built: draft → issued → paid, PDF, email), populated manually or via a new "generate" button.
3. Add a fifth, separate billing path — **usage-based** — for cabinets who don't fit the flat tiers. This is NOT a variant of the 3 tiers; it's a distinct mode with no `Plan`/`planId` attached. Price is per-examination, set per tenant (not global), default 5 RON.
4. Super-admin (only) chooses and switches a tenant's billing mode. There is no self-serve plan switching by the cabinet.
5. Once a cabinet is an active paying customer, the tier/pricing comparison table must no longer be shown to them — only their current plan name/status and their own invoice history.

## 1. Schema changes (`prisma/schema.prisma`)

Add to `Subscription`:
```prisma
model Subscription {
  // ...existing fields...
  billingMode          BillingMode @default(flat) @map("billing_mode")
  platformPricePerExam Decimal?    @map("platform_price_per_exam") @db.Decimal(10, 2)
  // stripeCustomerId, stripeSubscriptionId — REMOVE these two fields entirely
}
```

New enum:
```prisma
enum BillingMode {
  flat   // billed via Plan.monthlyPrice (planId must be set to one of the 4 tiers)
  usage  // billed via platformPricePerExam × completed examinations that month (planId must be null)
}
```

Remove entirely:
- `model ProcessedStripeEvent` (was only for Stripe webhook idempotency)
- The `stripeProductId` / `stripePriceId` fields on `Plan` can stay (harmless reference data) or be dropped — drop them, they're dead weight once Stripe is gone.

Write and run the migration. Do NOT attempt to backfill `billingMode` — default `flat` is correct for every existing row since no tenant is currently on a real Stripe subscription (confirmed with the user — no live paying customers on Stripe yet, so no data migration is needed for that reason, but double check by querying for any `Subscription` rows with a non-null `stripeSubscriptionId` before dropping the columns, and flag it to the user if any exist instead of silently dropping data).

## 2. Remove Stripe entirely

Delete these files:
- `app/api/billing/checkout/route.ts`
- `app/api/billing/portal/route.ts`
- `app/api/billing/webhook/route.ts`
- `lib/email/templates/subscription/payment-failed.ts` (see step 6 for its replacement)

Remove from `package.json`: `"stripe"` and `"@stripe/stripe-js"` dependencies. Run the package manager to update the lockfile.

Search the codebase for any remaining `Stripe` imports, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `stripeCustomerId`, `stripeSubscriptionId` references and remove/update each one. Known locations to check: `app/(authenticated)/settings/billing/page.tsx`, `billing-client.tsx`, `vercel.json` (cron config, unrelated to Stripe but verify), any seed scripts.

## 3. Super-admin: billing mode control + invoice generation

**Extend `app/(authenticated)/super-admin/tenants/[id]/subscription-actions.tsx`:**

Add a "Mod de facturare" section with:
- A toggle/select: `Flat (abonament)` / `Usage (per consultație)`
- When `usage` is selected: a numeric input for `platformPricePerExam` (RON), prefilled with the tenant's current value or `5` as default for a tenant with none set yet
- A save action that calls a new `set_billing_mode` action on the existing endpoint

**Extend `app/api/admin/subscriptions/[tenantId]/route.ts`**, add a new case in the switch:
```ts
case 'set_billing_mode': {
  if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })
  const mode = body.billingMode as 'flat' | 'usage'
  if (mode !== 'flat' && mode !== 'usage') {
    return NextResponse.json({ error: 'invalid_billing_mode' }, { status: 400 })
  }
  if (mode === 'flat') {
    // must have a tier/plan — keep existing tier, ensure planId is set
    const plan = await prisma.plan.findFirst({ where: { tier: sub.tier } })
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { billingMode: 'flat', planId: plan?.id ?? null, platformPricePerExam: null },
    })
  } else {
    const price = typeof body.platformPricePerExam === 'number' ? body.platformPricePerExam : 5
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { billingMode: 'usage', planId: null, platformPricePerExam: price },
    })
  }
  return NextResponse.json({ message: 'Mod de facturare actualizat.' })
}
```

**Add a "Generează factură" action**, either as a new button in `platform-invoices-tab.tsx` or a small new component next to it. UI: a month picker (default: previous full month) + a "Generează" button. On click, POST to a new endpoint `app/api/super-admin/platform-invoices/generate/route.ts`:

```ts
// POST body: { tenantId: string, year: number, month: number } (month 1-12)
// 1. Load tenant's current Subscription (must exist).
// 2. Compute period start/end (first/last instant of that month).
// 3. Build one line item:
//    - billingMode === 'flat': description `Abonament Buzomed — {tier} — {MM/YYYY}`,
//      quantity 1, unitPrice = current Plan.monthlyPrice (fetch live, don't trust a cached value)
//    - billingMode === 'usage': count prisma.examination.count({ where: {
//        tenantId, status: 'completed', completedAt: { gte: periodStart, lt: periodEnd }
//      }}); description `Consultații Buzomed — {count} examinări — {MM/YYYY}`,
//      quantity = count, unitPrice = sub.platformPricePerExam
//      (if platformPricePerExam is null, return 400 — billing mode misconfigured)
// 4. Reuse createPlatformInvoiceWithNumber exactly as the existing POST /api/super-admin/platform-invoices
//    does today (same VAT_EXEMPT_REASON, same snapshot fields from tenant). Do not duplicate that logic —
//    factor the invoice-creation body-building into a shared helper if convenient, called from both routes.
// 5. Guard against double-billing: if a non-deleted PlatformInvoice already exists for this tenant
//    with the same {invoiceYear, description matching this month/description pattern}, warn/block —
//    simplest: check for an existing invoice for this tenant with notes or a dedicated
//    `billingPeriod: "2026-06"` field before creating. Add a `billingPeriod String?` field to
//    PlatformInvoice for this purpose (e.g. "2026-06") and enforce @@unique([tenantId, billingPeriod])
//    where billingPeriod is not null.
```

Add `billingPeriod String? @map("billing_period")` to `PlatformInvoice` in the schema for this dedup purpose, with a partial unique constraint as noted.

## 4. Cabinet-facing billing page — remove Stripe, hide pricing after conversion

**Rewrite `app/(authenticated)/settings/billing/page.tsx`:**
- Remove `fetchStripeInvoices` and all Stripe imports.
- Fetch `prisma.platformInvoice.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, orderBy: [...], include: { items: true } })` instead of Stripe invoices.
- Keep fetching `subscription` and `plans` as today (still needed for the trial/pre-conversion view).

**Rewrite `billing-client.tsx`:**
- Remove `handlePortal`, `handleCheckout`, `hasStripeCustomer`, Stripe invoice list rendering.
- Add a rule: `const showPricingTable = subscription?.status === 'trial_active' || subscription?.status === 'trial_expired' || !subscription`. Only render the 3-tier (+ enterprise contact) comparison table when `showPricingTable` is true.
- When the tenant is already a paying customer (`status` is `active`, `past_due`, `comp`, or `suspended`) and `billingMode === 'flat'`: show just the current plan name and status badge, no comparison table, no prices of other tiers. Message: "Planul tău actual: {tier}. Pentru schimbări de plan, contactează-ne." — no self-serve switch button.
- When `billingMode === 'usage'`: show "Facturare pe consultații" with the current `platformPricePerExam` rate (informational, read-only) instead of a tier name.
- Below that: render the list of `PlatformInvoice` rows (number, period, total, status badge using the existing `invoice-status-badge.tsx` component, PDF download link).

## 5. Permissions — let a cabinet see its own platform invoices

Currently `app/api/super-admin/platform-invoices/[id]/pdf/route.ts` (and likely `[id]/route.ts`, `[id]/send-email/route.ts`) are `super_admin`-only. Add a second allowed path: `practice_admin` role AND the invoice's `tenantId` matches `auth.user.tenantId`. Do not weaken the existing super_admin path — this is additive:

```ts
const isSuperAdmin = auth.user.roles.includes('super_admin')
const isOwnTenantAdmin = auth.user.roles.includes('practice_admin') && auth.user.tenantId === invoice.tenantId
if (!isSuperAdmin && !isOwnTenantAdmin) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}
```
Apply this pattern consistently across the invoice detail/pdf routes that the cabinet's own billing page now needs to hit. Mutating actions (`pay`, `cancel`, `issue`) stay super_admin-only — the cabinet only ever reads.

Also add a tenant-scoped list endpoint if one doesn't cleanly exist yet (`GET /api/super-admin/platform-invoices?tenantId=X` already supports filtering by tenantId, but is super_admin-gated at the route level — add the same `isOwnTenantAdmin` check there, or create `app/api/companies/platform-invoices/route.ts` scoped implicitly to `auth.user.tenantId` if that's cleaner given how other tenant-scoped routes are structured in this codebase).

## 6. Cron (`app/api/cron/subscription-check/route.ts`)

- Remove nothing related to trial emails/enterprise alerts — unrelated to Stripe, keep as-is.
- Replace the `active → past_due` transition (currently based on `sub.currentPeriodEnd`, a Stripe concept) with: mark `Subscription.status = 'past_due'` when the tenant has a `PlatformInvoice` with `status: 'issued'` and `dueDate < now`. In the same pass, transition that invoice's own `status` to `'overdue'` (the enum already has this value).
- Repurpose the old `payment-failed` alert: when a `PlatformInvoice` newly crosses into `overdue`, send an internal alert to `ADMIN_EMAIL` (reuse the pattern of `renderAdminPastDueAlertEmail`, which already exists and is tenant/generic — check if it can be reused as-is instead of writing a new template; it likely can since it just needs `cabinetName`, `tenantId`, `daysPastDue`, `superAdminUrl`).
- Do not send anything to the cabinet automatically claiming "your card failed" — there is no card. If you want a cabinet-facing overdue reminder, it should say "factura X este restantă" and link to `settings/billing`, not payment-failure language. Optional for this batch — flag it but don't block on it if time is short.

## 7. Testing checklist for CC to verify before calling this done

- [ ] `npm run build` succeeds with `stripe` fully removed from `package.json` and no leftover imports
- [ ] Super-admin can switch a tenant from flat → usage and back, with `platformPricePerExam` persisted correctly
- [ ] "Generează factură" produces correct line items for both modes, against real `Examination` data in a test tenant
- [ ] Duplicate-generation for the same tenant+month is blocked (billingPeriod unique constraint)
- [ ] A `practice_admin` on Tenant A cannot fetch/download a `PlatformInvoice` PDF belonging to Tenant B (403)
- [ ] A `practice_admin` on Tenant A CAN fetch their own tenant's invoices and PDFs
- [ ] `settings/billing` for a `trial_active` tenant still shows the 3 flat tiers + enterprise contact
- [ ] `settings/billing` for an `active` tenant (flat or usage) does NOT show other tiers' prices
- [ ] Cron correctly flips `active → past_due` based on an overdue `PlatformInvoice`, not `currentPeriodEnd`
- [ ] No remaining references to `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` anywhere in the codebase or `.env.example`

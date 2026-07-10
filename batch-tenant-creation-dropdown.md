# BATCH — Fix "Tip abonament" dropdown on tenant creation

## Dependency note

This batch requires `Subscription.billingMode` (enum `flat`/`usage`) and `Subscription.platformPricePerExam` from the billing batch ("Remove Stripe, add manual + usage-based platform billing"). Check `prisma/schema.prisma` before starting — if those fields aren't there yet, wait for that batch to land first rather than redefining them here.

## Problem being fixed

`app/(authenticated)/super-admin/tenants/new/create-tenant-form.tsx` shows a "Tip abonament" dropdown with options Probă/Solo/Cabinet/Corporativ, backed by `Tenant.subscriptionTier` (`trial`/`solo`/`practice`/`enterprise`). But `app/api/tenants/route.ts` only ever branches on `subscriptionTier === 'enterprise'` — Probă, Solo, and Cabinet all produce the exact same result (`Subscription.tier: 'starter'`, `status: 'trial_active'`). Solo and Cabinet are non-functional dead options. Meanwhile the real billing tiers (`Plan`/`Subscription.tier`: starter/growth/pro) aren't selectable here at all.

## What stays untouched

- `ProbeInviteButton` / `/api/tenants/probe` — completely separate flow, do not touch.
- The "Enterprise" quick-link on `super-admin/page.tsx` (`/super-admin/tenants/new?tier=enterprise`) and the resulting enterprise creation path in `create-tenant-form.tsx` / `tenants/route.ts` (skip trial, `status: 'active'`, `tier: 'enterprise'`) — keep this working exactly as it does today.

## What changes

**1. `create-tenant-form.tsx` — replace the dropdown's normal (non-enterprise) options.**

Replace the form state:
```ts
subscriptionTier: (defaultTier === 'enterprise' ? 'enterprise' : 'trial') as 'trial' | 'solo' | 'practice' | 'enterprise',
```
with two fields:
```ts
planTier: (defaultTier === 'enterprise' ? undefined : 'starter') as 'starter' | 'growth' | 'pro' | undefined,
billingMode: 'flat' as 'flat' | 'usage',
platformPricePerExam: 5, // default, only relevant/sent when billingMode === 'usage'
isEnterprise: defaultTier === 'enterprise',
```

Dropdown behavior:
- If `defaultTier === 'enterprise'` (arrived via the special link): do NOT render the dropdown at all — keep the existing "Cabinet creat ca Enterprise — facturare negociată separat." notice as the only indicator, same as today. This path bypasses everything below.
- Otherwise, render:
  ```
  <select> for planTier vs usage — actually render as a single "Tip abonament" select with 4 options: Starter, Growth, Pro, Usage-based (per consultație)
  ```
  Concretely: keep one `<select>` bound to a combined value (e.g. `'starter' | 'growth' | 'pro' | 'usage'`), and derive `planTier`/`billingMode` from it on submit — simpler than two separate selects for the person filling the form. Labels: "Starter", "Growth", "Pro", "Usage-based (preț per consultație)". Use plain hardcoded Romanian labels here instead of routing through the `labels`/`t()` dictionary that `subscriptionSolo`/`subscriptionPractice` used — those i18n keys are being retired (see step 3).
- When the selected value is `'usage'`, show an additional numeric input: "Preț per examinare (RON)", bound to `platformPricePerExam`, default `5`, min `0`, step `0.5`. Hide it for the other three options.

**2. `app/api/tenants/route.ts` — replace the `isEnterprise`-only branch.**

Current logic (around line 169-175):
```ts
const isEnterprise = body.subscriptionTier === 'enterprise'
// ...
tier: isEnterprise ? 'enterprise' : 'starter',
status: isEnterprise ? 'active' : 'trial_active',
trialEndsAt: isEnterprise ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
```

Replace with a three-way branch reading `body.planTier`, `body.billingMode`, `body.platformPricePerExam` (all sent from the updated form):

```ts
const isEnterprise = body.subscriptionTier === 'enterprise' // keep reading this for the untouched enterprise link path
const isUsageBased = !isEnterprise && body.billingMode === 'usage'

let subscriptionData: Prisma.SubscriptionUncheckedCreateInput['data'] // adjust to actual create shape used here
if (isEnterprise) {
  // unchanged from today
  subscriptionData = { tier: 'enterprise', status: 'active', trialEndsAt: null, billingMode: 'flat', planId: enterprisePlan?.id ?? null }
} else if (isUsageBased) {
  subscriptionData = {
    tier: 'starter', // placeholder tier value, not used for billing when billingMode is usage — confirm with the billing batch whether `tier` should be nullable instead; if so, use null
    billingMode: 'usage',
    planId: null,
    platformPricePerExam: typeof body.platformPricePerExam === 'number' ? body.platformPricePerExam : 5,
    status: 'trial_active',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  }
} else {
  const tier = ['starter', 'growth', 'pro'].includes(body.planTier) ? body.planTier : 'starter'
  const plan = await prisma.plan.findFirst({ where: { tier } })
  subscriptionData = {
    tier,
    billingMode: 'flat',
    planId: plan?.id ?? null,
    status: 'trial_active',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  }
}
```
Every non-enterprise path gets the same 14-day trial regardless of which of the 4 options was picked — the tier/mode only determines what they're billed as once the trial ends or is converted, not whether they get a trial. This matches production behavior today for starter and should now apply identically for growth/pro/usage.

**3. Clean up the now-unused `Tenant.subscriptionTier` display logic.**

`Tenant.subscriptionTier` (the `trial`/`solo`/`practice`/`enterprise` enum) becomes vestigial once Solo/Cabinet stop being real choices — don't keep writing meaningless distinctions into it. Two read sites currently display it as a badge:
- `app/(authenticated)/super-admin/page.tsx:377`
- `app/(authenticated)/super-admin/tenants/[id]/page.tsx:186`

Change both to display the real state instead — `Subscription.tier` when `billingMode === 'flat'` (e.g. "Starter" / "Growth" / "Pro" / "Enterprise"), or "Usage-based ({platformPricePerExam} RON/examinare)" when `billingMode === 'usage'`. Fetch `Subscription` alongside `Tenant` at those two call sites if not already included in the query.

Leave the `SubscriptionTier` enum and `Tenant.subscriptionTier` column in the schema for now (removing a column is a separate, lower-priority cleanup) — just stop relying on it for anything meaningful. In `tenants/route.ts`, still write `subscriptionTier: isEnterprise ? 'enterprise' : 'trial'` to the `Tenant` row (harmless, keeps the column non-null/consistent) but treat `Subscription` as the only source of truth going forward.

## Testing checklist

- [ ] Creating a tenant via the normal "Cabinet nou" flow shows exactly 4 options: Starter, Growth, Pro, Usage-based — no Probă/Solo/Cabinet/Corporativ labels left anywhere
- [ ] Picking Usage-based reveals the price-per-exam field, defaulted to 5, and the value is correctly saved on `Subscription.platformPricePerExam`
- [ ] Picking Starter/Growth/Pro correctly sets `Subscription.tier` and links the right `Plan` via `planId`
- [ ] All four non-enterprise paths get `status: 'trial_active'` and a 14-day `trialEndsAt`
- [ ] The `/super-admin/tenants/new?tier=enterprise` link still works exactly as before (no dropdown shown, enterprise created active with no trial)
- [ ] `ProbeInviteButton` flow is fully unaffected
- [ ] The tier badges on the tenant list and tenant detail page in super-admin now show the real Subscription-based tier/billing mode, not the old dead `subscriptionTier` enum

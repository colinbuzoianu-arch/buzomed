# BATCH — Trial reminder consolidation, GDPR unsubscribe, invoice lifecycle emails

## 0. Dependency note — read before starting

A separate, parallel batch ("Remove Stripe, add manual + usage-based platform billing") is being worked on concurrently and touches some of the same files this batch needs, specifically:
- `prisma/schema.prisma` (adds `BillingMode` enum, `Subscription.billingMode`, `Subscription.platformPricePerExam`, `PlatformInvoice.billingPeriod`)
- `app/api/cron/subscription-check/route.ts` (adds overdue-detection logic for `PlatformInvoice`, replacing the old Stripe-based `past_due` transition)

Before touching either file, `git pull`/check current state. If the billing batch's changes are already present, build additively on top of them — do not revert or duplicate their logic. If they are not yet present, note it in your summary at the end and proceed with the parts of this batch that don't strictly depend on them (everything in section 1 and 2 is independent; section 3 needs `PlatformInvoice.billingPeriod` for part (d) — if that field doesn't exist yet, add it yourself with the same shape described in the other batch: `billingPeriod String? @map("billing_period")`).

---

## 1. Trial reminders — consolidate to a single email, 3 days before expiry

**Remove:**
- `lib/email/templates/subscription/trial-day7.ts` (delete the file)
- The `renderTrialDay7Email` import and the entire day7 branch (`daysUntilExpiry <= 7`) in `app/api/cron/subscription-check/route.ts`

**Keep and rework `trial-day11.ts`:**
- Rename the file to `lib/email/templates/subscription/trial-reminder.ts` and the function to `renderTrialReminderEmail` (the "11" naming was an implementation detail, not something meaningful to keep now that it's the only reminder). Update the import in the cron route accordingly.
- Content stays essentially the same (subject "Ultimele 3 zile — alege planul tău Buzomed", pricing table, CTA) — this part was already correct.

**Fix the send-once bug.** Today the cron re-sends this email every day the condition matches, because there's no sent-flag (unlike `enterpriseAlertSent`/`pastDueAlertSent` which already follow the correct pattern). Add to `Subscription`:
```prisma
trialReminderSentAt DateTime? @map("trial_reminder_sent_at")
```
Cron logic for the `trial_active` branch becomes:
```ts
if (sub.trialEndsAt) {
  const daysUntilExpiry = (sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  if (daysUntilExpiry < 0) {
    // existing trial_expired transition — unchanged
  } else if (daysUntilExpiry <= 3 && !sub.trialReminderSentAt) {
    const content = renderTrialReminderEmail({ cabinetName: tenant.name, adminName, trialEndsAt: sub.trialEndsAt, billingUrl: BILLING_URL })
    await sendEmail({ to: { email: adminEmail, name: adminName }, content, tenantId: sub.tenantId, tags: ['trial-reminder'] })
    await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderSentAt: now } })
    processed++
  }
}
```
Sends exactly once per trial, whenever the cron first observes ≤3 days remaining (handles both the normal case and a cron that missed a day).

**Reset the flag when a trial is extended.** In `app/api/admin/subscriptions/[tenantId]/route.ts`, the `extend_trial` case must clear `trialReminderSentAt: null` in its `update` call — otherwise a cabinet whose trial gets extended past the 3-day mark never gets reminded again before the new (later) expiry.

**Fix wording bug.** In `lib/email/templates/subscription/trial-welcome.ts`, replace the mixed-language line `"suntem here to help"` with a proper Romanian phrase, e.g. `"suntem aici să te ajutăm"`.

**Leave unchanged:** `trial-welcome.ts`, `trial-expired.ts`, `trial-deletion-warning.ts`, and the three internal `admin-*-alert.ts` templates — none of these had the dedupe bug or need wording changes.

---

## 2. GDPR — unsubscribe mechanism

**Schema — add a suppression table** (not a field on `User`, because recipients of invoice emails may not have a User row — the tenant's billing email is enough):
```prisma
model EmailSuppression {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique
  reason        String?  // free text, e.g. "user-initiated", "bounce"
  suppressedAt  DateTime @default(now()) @map("suppressed_at") @db.Timestamptz

  @@map("email_suppressions")
}
```
Store the email lowercased and trimmed on write and on lookup.

**New helper `lib/email/suppression.ts`:**
```ts
export async function isSuppressed(email: string): Promise<boolean>
export async function suppress(email: string, reason?: string): Promise<void>
export function generateUnsubscribeToken(email: string): string   // HMAC-SHA256(email.toLowerCase(), secret), hex
export function verifyUnsubscribeToken(email: string, token: string): boolean
export function generateUnsubscribeUrl(email: string): string     // `${APP_URL}/api/email/unsubscribe?email=...&token=...`
```
Use a new env var `EMAIL_UNSUBSCRIBE_SECRET` for the HMAC key (add to `.env.example`). Token is stateless — no DB write needed to issue it, only to record the unsubscribe when clicked.

**New endpoint `app/api/email/unsubscribe/route.ts`** — public, no auth (a person clicking an email link isn't logged in):
- `GET` with `?email=&token=`: verify token, call `suppress(email, 'user-initiated')`, return a minimal static confirmation HTML page ("Te-ai dezabonat cu succes."). Invalid/missing token → generic "link invalid" page, do not leak whether the email exists.
- `POST` to the same path with the same params: same behavior, for the RFC 8058 one-click unsubscribe header (see below). Support both since some mail clients only do GET-via-click and some (Gmail's "Unsubscribe" button next to sender) do a POST.

**Wire suppression into `lib/email/send.ts`:**
- Add `suppressible?: boolean` to `SendEmailParams` (default `true`).
- At the top of `sendEmail`, if `params.suppressible !== false`, check `isSuppressed(params.to.email)`; if suppressed, skip the send, still write an `emailDelivery` row with `success: true` and a note that it was skipped (add a `skipped: boolean` column to `EmailDelivery` if one doesn't already fit, or reuse `errorMessage` with a clear `'skipped_suppressed'` marker — check the existing `EmailDelivery` model shape before deciding which is cleaner), and return early without calling Brevo.
- Mark `suppressible: false` only on genuinely transactional/security emails that a user must receive regardless of marketing opt-out — invite emails, password reset if one exists. Check `lib/email/templates/index.ts` / `renderInviteEmail` usage site and set `suppressible: false` there. Everything else (trial lifecycle, invoice lifecycle) stays suppressible.

**Add `List-Unsubscribe` / `List-Unsubscribe-Post` headers.** In `sendEmail`, when the content is suppressible, set:
```ts
message.headers = {
  ...params.headers,
  'List-Unsubscribe': `<${generateUnsubscribeUrl(params.to.email)}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
}
```
Verify the Brevo SDK (`@getbrevo/brevo`) actually forwards custom headers on `SendSmtpEmail.headers` for transactional sends (it's used already in this file for `params.headers`, so the mechanism exists — just confirm List-Unsubscribe specifically isn't stripped).

**Add a footer unsubscribe line to templates.** In `lib/email/templates/layout.ts`, extend `renderEmailLayout` to accept an optional `unsubscribeUrl?: string`, and if present, append a small line under the existing footer text: `Nu mai vrei să primești acest tip de email? <a href="...">Dezabonează-te</a>`. Update call sites in `trial-welcome.ts`, `trial-reminder.ts`, `trial-expired.ts`, `trial-deletion-warning.ts`, and the new templates from section 3 to pass `unsubscribeUrl: generateUnsubscribeUrl(params.adminEmail or recipient email)`. The three internal `admin-*-alert.ts` templates (sent to `hello@buzomed.com`, i.e. to yourself) do NOT need this — they're not sent to a data subject exercising GDPR rights.

---

## 3. New payment/invoice lifecycle emails

All four templates go in a new directory `lib/email/templates/platform-invoice/` except (d), which goes alongside the existing internal alerts in `lib/email/templates/subscription/` for consistency with `admin-enterprise-alert.ts` etc.

**(a) Payment confirmation — `platform-invoice/payment-confirmed.ts`**
- Trigger: in `app/api/super-admin/platform-invoices/[id]/pay/route.ts`, after the `prisma.platformInvoice.update(...)` that sets `status: 'paid'`, send this email to `updated.snapshotTenantEmail ?? tenant.email` (fetch tenant email if not already in scope — check what's selected in that route today and extend the query if needed).
- Content: confirms invoice number, amount, date paid. No PDF attachment needed (they already received the invoice PDF via the existing send-email flow) — just a short confirmation. Tag: `platform-invoice-paid`.
- Don't block the HTTP response on email send — fire with `void sendEmail(...)` same pattern as elsewhere in this codebase (see `writeAuditLog` usage), so a transient email failure doesn't fail the payment-marking action itself.

**(b) Due-soon reminder — `platform-invoice/invoice-due-soon.ts`**
- Add `dueSoonReminderSentAt DateTime? @map("due_soon_reminder_sent_at")` to `PlatformInvoice`.
- Cron addition (in the same daily job, `subscription-check`, or a new dedicated cron if the file is getting crowded from the concurrent billing batch — your call based on what you find when you check the file): for every `PlatformInvoice` with `status: 'issued'`, `dueDate` between now and 3 days from now, and `dueSoonReminderSentAt: null`, send this email to the tenant's billing email, then set the flag.
- Content: "Factura X, scadentă pe {dueDate}, în valoare de {total} — te rugăm să o achiți până atunci." No pressure/dunning tone, this is a courtesy reminder, not a warning.

**(c) Overdue reminder — `platform-invoice/invoice-overdue.ts`**
- This is customer-facing and complements (does not replace) the internal `admin-past-due-alert` that the billing batch wires up for you.
- Add `overdueReminderCount Int @default(0) @map("overdue_reminder_count")` and `lastOverdueReminderAt DateTime? @map("last_overdue_reminder_at")` to `PlatformInvoice`.
- Cron addition: for every `PlatformInvoice` with `status: 'overdue'`, send this email on the day it first becomes overdue, then again every 7 days, capped at 3 total sends (`overdueReminderCount < 3` and `(now - lastOverdueReminderAt) >= 7 days` or `lastOverdueReminderAt` is null). Beyond 3 reminders, stop automatically — further follow-up becomes a manual/human decision, not the system's job.
- Content: factual, not aggressive — invoice number, amount, original due date, days overdue, payment instructions/contact. This is a small B2B market; the tone should read as "ai uitat probabil" not "veți fi penalizat".

**(d) Internal monthly generation reminder — `subscription/admin-monthly-invoice-reminder.ts`**
- New cron: `app/api/cron/monthly-invoice-reminder/route.ts`, same auth pattern as `subscription-check` (checks `CRON_SECRET` header). Register it in `vercel.json` to run once, early on the 1st of each month.
- Logic: for every `Subscription` with `status: 'active'` (regardless of `billingMode`), check whether a `PlatformInvoice` exists with `billingPeriod` equal to last month (e.g. `"2026-06"`) and `deletedAt: null`. Collect the tenants that don't have one.
- If the list is non-empty, send one email to `ADMIN_EMAIL` (yourself) listing all of them (tenant name, tier or usage rate, link to `super-admin/tenants/{id}`), so you have a single monthly checklist instead of needing to remember to check every tenant individually.
- If the list is empty, don't send anything — no need for a "nothing to do" email every month.

---

## 4. Testing checklist

- [ ] A trial cabinet with 3 days left receives exactly one reminder email, not one per day for the remaining days
- [ ] Extending a trial after the reminder was sent clears the flag and a new reminder fires correctly before the new expiry
- [ ] Clicking the unsubscribe link in any email suppresses that address; a subsequent `sendEmail` call to that address is skipped (verify via `EmailDelivery` log, not just absence of a Brevo call)
- [ ] Invite emails still arrive even for a suppressed address (suppressible: false path)
- [ ] Marking an invoice `paid` sends the confirmation email and doesn't fail the request if the email send throws
- [ ] Due-soon reminder fires once per invoice, not repeatedly, for invoices 3 days from their due date
- [ ] Overdue reminder fires on day 0 of overdue status, again around day 7 and day 14, then stops
- [ ] Monthly reminder correctly identifies tenants missing an invoice for the previous `billingPeriod`, and sends nothing when the list is empty
- [ ] No leftover reference to `trial-day7` anywhere in the codebase after the rename/removal

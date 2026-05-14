# Buzomed — session 12: Password recovery + admin user management + assistant permissions

Three concerns shipped as one bundle. Designed to be applied in one unzip but committed in **three separate commits** so any failure can be reverted cleanly.

## What's in this bundle (29 files + README)

### Password recovery (5 files)
- `app/forgot-password/page.tsx` — server page with branding
- `app/forgot-password/forgot-password-form.tsx` — client form using Supabase `resetPasswordForEmail`
- `app/reset-password/page.tsx` — server page with branding
- `app/reset-password/reset-password-form.tsx` — token-aware client form using Supabase `updateUser({ password })`
- `app/login/login-form.tsx` — adds the "Forgot password?" link below the submit button
- `app/login/page.tsx` — passes the new `forgotPasswordLink` label

### Admin user management (3 files)
- `app/api/users/[id]/route.ts` — GET single user, PATCH (roles + isActive + professionalTitle), DELETE (archive)
- `app/(authenticated)/team/page.tsx` — adds Actions column visible to practice_admins
- `app/(authenticated)/team/user-admin-actions.tsx` — edit dialog client component

### Permission infrastructure (3 files)
- `lib/permissions/tenant-data.ts` — refactored with separate `canWriteAdministrative` and `canWriteClinical`; kept `canWriteTenantData` as a deprecated alias for safety
- `lib/permissions/user-admin.ts` — who can manage user accounts
- `lib/permissions/last-admin.ts` — prevents demoting/archiving the last practice_admin

### Assistant permission overhaul (15 API routes)
13 routes swapped from `canWriteTenantData` → `canWriteAdministrative`:
- `app/api/companies/*` — companies + workplaces CRUD
- `app/api/employees/*` — employee CRUD, assignments, bulk import
- `app/api/documents/*` — document upload/delete
- `app/api/examinations/route.ts` — creating examinations (scheduling)
- `app/api/examinations/[id]/cancel/route.ts` — cancelling/no-show
- `app/api/recalls/[id]/*` — schedule/cancel recalls

Special cases (2 routes with mixed access patterns):
- `app/api/examinations/[id]/route.ts` — PATCH uses `canWriteClinical` (clinical fields), DELETE uses `canWriteAdministrative` (delete an unstarted exam)
- `app/api/employees/route.ts` + `[id]/route.ts` — additional `canWriteSensitivePii` guard blocks assistants from CNP operations specifically

### i18n
- `scripts/merge-i18n-session-12.mjs` — adds 37 keys per locale (forgot/reset password, team.userAdmin namespace)

## Pre-flight check

```bash
git log --oneline -3
# Top commit should be 81de856 or later
```

## Integration — applied in ONE step

```bash
cd C:/Projects/Buzomed
unzip -o ~/Downloads/buzomed-session-12.zip

# No new dependencies, no schema changes, no env vars
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate

# i18n merge
node scripts/merge-i18n-session-12.mjs

# Clean restart
rm -rf .next
npx tsc --noEmit
npm run dev
```

## Committed in THREE commits

Once everything is unzipped and tested locally, commit in this order so each can be reverted independently if Vercel blows up on production:

```bash
# Commit 1 — Password recovery (low risk, isolated)
git add app/forgot-password/ \
        app/reset-password/ \
        app/login/login-form.tsx \
        app/login/page.tsx
git commit -m "feat(auth): password recovery via Supabase resetPasswordForEmail"

# Commit 2 — Admin user management (medium risk)
git add app/api/users/ \
        "app/(authenticated)/team/page.tsx" \
        "app/(authenticated)/team/user-admin-actions.tsx" \
        lib/permissions/user-admin.ts \
        lib/permissions/last-admin.ts
git commit -m "feat(team): admin can edit roles, deactivate, and archive users"

# Commit 3 — Assistant permission overhaul (highest risk — touches every write route)
git add lib/permissions/tenant-data.ts \
        "app/api/companies/" \
        "app/api/documents/" \
        "app/api/employees/" \
        "app/api/examinations/" \
        "app/api/recalls/"
git commit -m "feat(permissions): assistants can write administrative data, blocked from clinical writes and CNP"

# Commit 4 — i18n (covers all three)
git add scripts/merge-i18n-session-12.mjs \
        messages/ro.json \
        messages/en.json
git commit -m "i18n: session 12 keys (password recovery + team admin)"

git push
```

If commit 3 breaks anything in production (the permission overhaul is the riskiest), `git revert <commit-3-hash> && git push` preserves the other features.

## What changes for each role

### practice_admin (no change in their capabilities)
- Can still do everything they could before
- NEW: Edit/archive buttons appear next to team members on `/team`

### practitioner (no change in their capabilities)
- Can still do everything they could before
- No new UI changes; team page is unchanged for them

### assistant (significant expansion)
**Now CAN**:
- Create / edit / archive companies, workplaces
- Create / edit / archive employees (WITHOUT setting CNP)
- Manage workplace assignments
- Bulk-import employees
- Create scheduled examinations (the actual scheduling action)
- Cancel or no-show an examination
- Upload / delete documents
- Schedule recalls (Programează button on Scadențe tab)
- Cancel recalls
- Delete misclicked examination records (before they're started)

**Still CANNOT**:
- Fill clinical findings in an examination (the form's clinical sections)
- Set a verdict (apt/inapt/etc)
- Sign a fișa de aptitudine
- Start an examination (clinical workflow)
- Set or change a CNP (server-side guard)
- See decrypted CNP (still masked display only)
- Invite other users
- Edit other users' roles

This is the "hybrid mode" you asked for: assistants do all the receptionist + data entry + scheduling work, doctors do the clinical work.

## Design decisions baked in

### Backwards-compat preserved
`canWriteTenantData` is kept as a deprecated alias mapping to `canWriteClinical`. Any code I missed continues to work conservatively — the stricter check is safer than the looser one. No silent privilege escalation can occur.

### CNP guard at the server, not just UI
Even if the UI shows the CNP field to an assistant (it doesn't, but defensively), the server-side `canWriteSensitivePii` check rejects any CNP operation by an assistant with a 403 + explanatory message. Defense in depth.

### Last-admin guard at write time
Three operations require the guard:
1. Demoting a user (removing `practice_admin` from roles)
2. Deactivating a user (`isActive: false`)
3. Archiving a user (`deletedAt` set)

For each, the API counts other active non-archived practice_admins in the tenant. If zero, returns 409 `last_admin_protected` with a friendly explanation.

The user themself cannot self-demote — `canManageUser` rejects with `cannot_modify_self`. Prevents accidental self-lockout regardless of admin count.

### Soft-delete for users
`DELETE /api/users/[id]` sets `deletedAt`. Never removes the row. Historical references (signed fișas reference the practitioner by name, audit logs, exam authorship) keep working forever. Reactivation is theoretically possible by manually clearing `deletedAt` — no UI for this yet, but the row is preserved.

### Password recovery — anti-enumeration
Supabase's `resetPasswordForEmail` returns success even when the email isn't registered. This is deliberate — leaking which email addresses exist in your system is a security anti-pattern. The UI mirrors this: it always shows "if this email exists, you'll receive a link." Confused users will check their spam folder; attackers learn nothing.

### Password length check
Client-side validation requires minimum 8 characters. Supabase has its own server-side minimum (also 6+ by default). The 8-character UI requirement is stricter than Supabase's default — not a security claim, just a sane lower bound.

## Test plan

### Password recovery
1. Sign out → click "Ai uitat parola?" below the login button → routes to `/forgot-password`
2. Enter your own email address → click "Trimite link-ul"
3. Verify the green "if an account exists, you'll receive an email" message appears
4. Check your inbox — Supabase default email should arrive within ~1 minute
5. Click the link in the email → routes to `/reset-password` with a recovery session active
6. Enter a new password (8+ chars) twice → click "Salvează parola"
7. Success message appears → click "Continuă către aplicație" → routed to home, logged in
8. Sign out and sign in with the NEW password → works

### Edge cases
9. Visit `/reset-password` directly (without coming from an email) → shows "this link is invalid or expired"
10. Enter mismatched passwords → "Parolele nu se potrivesc" error
11. Enter a password shorter than 8 chars → "Parola trebuie să aibă cel puțin 8 caractere"
12. Request a reset for an email that doesn't exist → same success message (anti-enumeration)

### Admin user management
13. Sign in as a practice_admin
14. Go to `/team` → Actions column appears with "Editează" button for each member except yourself
15. Click "Editează" on a teammate → dialog opens with their current roles, active status, professional title
16. Uncheck "practitioner" and check "assistant" → click "Salvează modificările"
17. Refresh — the user's role badges in the table reflect the change
18. Sign in as that user → they now have assistant permissions (test below)
19. Back as practice_admin, on the same teammate, click "Editează" → click "Arhivează" → confirm
20. Refresh — that user disappears from the team list
21. Database check: `SELECT id, email, deleted_at FROM users WHERE id = '<that user id>'` — deletedAt is set

### Last-admin guard
22. Make sure you're the ONLY practice_admin in your tenant (check team page)
23. Try to edit yourself → no Edit button appears (self-edit blocked)
24. Create or invite a second user with NO admin role, accept the invite, sign in as them
25. Sign back in as practice_admin
26. Try to edit YOUR OWN role by manually crafting a request — UI doesn't allow it
27. Promote the second user to practice_admin → save → succeeds
28. Now try to demote yourself or the other admin → succeeds (because there are now 2 admins, can drop to 1)
29. Try to archive whichever is now the last admin → "last_admin_protected" error message

### Assistant permission overhaul

#### Setup
30. Have a practice_admin promote someone to `assistant` role (clear any other roles)
31. Sign in as that assistant

#### What they CAN now do (previously couldn't)
32. Navigate to `/companies` → "+ Companie nouă" button is visible. Click it. Fill in the form. Submit. Company created.
33. Click into the company → "Edit" buttons appear on workplaces. Click one. Modify the name. Save. Works.
34. Navigate to `/employees` → "+ Angajat nou" and "Importă" buttons are visible. Create a new employee WITHOUT CNP (idDocumentType=other or none). Works.
35. Try to set idDocumentType=CNP and submit → 403 with "Assistants cannot set CNP. A practitioner must add the CNP at the in-person examination."
36. Use the bulk import flow → uploads, previews, commits. Works.
37. Navigate to `/examinations` → "+ Examinare nouă" is visible. Pick a worker + workplace + exam type, set status=scheduled. Submit. Works.
38. From the Scadențe tab, click "Programează" on any pending recall → the schedule dialog appears. Pick a practitioner. Submit. Works — a new examination is created in `scheduled` state.

#### What they STILL CAN'T do
39. Open any scheduled examination → "Start examination" button: tap it. Should fail (403) — clinical-write required.
40. If a practitioner has already started an exam, the assistant CAN view it but can't edit the clinical form fields (verdict, vitals, etc).
41. Open `/team` → no Edit buttons (assistants can't modify users).
42. Try to send a team invitation → no invite button visible (assistants can't invite).

#### CNP edge case
43. Sign in as practitioner. Create employee with CNP. Confirm CNP saves correctly (the existing workflow still works).
44. Sign back in as assistant. View that same employee → CNP is masked (`185031*******`), no reveal button.
45. Edit the employee's name only → save. Works.
46. Try to change `idDocumentType` away from CNP via the form → blocked with 403.

### Old URL backwards compat
47. Any code paths that still call the deprecated `canWriteTenantData` — should continue to work, restricting access to practitioners only (same as before).

## What's NOT in this session

- **Custom email templates for password recovery** — using Supabase defaults. Functional, looks generic. Re-evaluate after 10 cabinets.
- **Self-service "Resend invitation" for the practice_admin** — out of scope for this session.
- **Reactivate-archived-user UI** — soft-delete row exists, but no button to bring them back. Add later if needed.
- **Audit log of permission-relevant actions** — schema field exists (`auditLogEntries` relation), no writer yet. Future session.
- **Bulk role changes** — one user at a time only.

## What was specifically NOT changed

- **`/api/examinations/[id]/sign/route.ts`** — still clinical-write. Signing fișa is a licensed-medic action.
- **`/api/examinations/[id]/start/route.ts`** — still clinical-write. Starting clinical workflow is practitioner-only.
- **`/api/examinations/[id]/route.ts` PATCH** — clinical-write. Editing clinical findings is practitioner-only.
- **`/api/tenants/*`** — super_admin only, no changes.

## Strategic note (last time)

This session is the third in a row that polished the product without a single cabinet conversation. The features you've shipped are increasingly difficult to test in isolation — "does the assistant role match real workflow?" cannot be answered by you alone.

Two specific things one cabinet would clarify in 5 minutes each:

1. **Does the assistant/practitioner split match how cabinets actually divide work?** Maybe the assistant DOES set verdicts in their cabinet (the practitioner reviews + signs). Maybe they don't touch examinations at all and only do reception. You're designing in the dark.
2. **Do they want password recovery in Romanian email copy with their cabinet name?** The default Supabase email is in English from `noreply@mail.supabase.io`. Acceptable for now, but a practitioner might say "my workers will think this is a phishing email."

Send the LinkedIn message this week. The product won't get more demoable than it is now. The next session should be informed by feedback, not guesses.

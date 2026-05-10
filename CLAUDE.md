[paste the entire content above between these markers]
# Buzomed — Handoff Document

## Project
Buzomed (verumsell.com), occupational medicine multi-tenant SaaS at C:/Projects/Buzomed.

Owner: Colin (super_admin in dev env: colinbuzoianu@gmail.com).

## Stack
- Next.js 16.2.4 (Turbopack)
- Prisma + Supabase Postgres
- Tailwind v4, shadcn/ui
- i18n: ro (default) + en
- Email: Brevo (sender hello@buzomed.com)
- Auth: Supabase Auth

## Current state (end of session 3)

### What works end-to-end
- Sign in as super_admin → /super-admin → tenant list
- Create tenant via /super-admin/tenants/new → auto-sends practice_admin invite email
- Invitee clicks email link → /accept-invite/[token] → sets password → redirected to /login with email pre-filled and "account created" banner
- Sign in as practice_admin/practitioner/assistant → /team → tenant-scoped members + invitations
- Role-aware invite hierarchy:
  - super_admin invites practice_admin
  - practice_admin invites practitioner or assistant
  - practitioner invites assistant only
  - assistant has read-only team view
- Global email collision protection (prevents inviting an email that already has an active account anywhere)
- Public route allowlist in proxy: /login, /accept-invite, /api/invitations/accept, /api/auth, /_next, /favicon.ico

### Database
- 17 Prisma models (see prisma/schema.prisma)
- UserRole enum: super_admin, practice_admin, practitioner, assistant
- users.email is GLOBALLY unique (single-tenant membership only — multi-tenant access not yet supported)
- Soft delete via deletedAt on all tables
- RLS policies applied to all 17 tenant-scoped tables (currently dormant — see C.2d below)

### Two test tenants
- Test Cabinet: 37dc0318-df3a-4400-9a2c-66fb287b6926 (placeholder admin)
- Exemplu Cabinet: 3b59e85f-1246-44ea-8034-a1602f412d4e (active admin)

## Deferred work (when going Supabase Pro plan)

### C.2d — Route migration to use prismaApp + RLS enforcement
Blocked by: Supabase IPv4 add-on requires Pro plan ($35/mo). Direct connection to db.<project-ref>.supabase.co is IPv6-only on free tier; dev machine can't resolve.

Currently:
- All routes use `prisma` (superuser, bypasses RLS)
- `prismaApp` (RLS-respecting, connects as buzomed_app role) is wired but unused
- `withAuth` is fully implemented in lib/prisma.ts
- RLS policies exist in DB and have been verified via psql tests

When IPv4 add-on is activated:
- Apply route patches from buzomed_session3_c2.tar.gz route_patches/ folder:
  - app/(authenticated)/super-admin/page.tsx
  - app/(authenticated)/super-admin/tenants/[id]/page.tsx
  - app/(authenticated)/team/page.tsx
  - app/api/invitations/route.ts (GET only — POST stays on admin client)
- Test each route after each replacement (~45-60 min total)

### Routes that intentionally STAY on admin client (`prisma`, not prismaApp)
These cross-tenant or pre-auth boundaries; RLS would block legitimate operations:
- app/api/tenants/route.ts (POST) — bootstrap, no tenant exists yet
- lib/invitations/accept-service.ts — runs partly pre-auth
- lib/invitations/service.ts (validateInvitationToken — public; createInvitation — needs cross-tenant email check)
- app/api/invitations/[id]/revoke/route.ts (could migrate later, low priority)
- All app/api/dev/* routes

### C.3 — Rename `prisma` to `prismaAdmin`
Pure cosmetic rename for clarity. Make `prismaApp` the default-think. ~30 min when ready.

## Key gotchas to remember

### Environment
- Windows + Git Bash + Turbopack: messages/ro.json sometimes file-locks during VS Code save. Transient. If stuck: Ctrl+C, `rm -rf .next`, npm run dev.
- Port 3000 occasionally orphaned by previous dev server. Kill via `netstat -ano | grep :3000` then `taskkill /PID <num> /F`.
- VS Code settings has `"files.associations": {"*.css": "tailwindcss"}` and `"css.lint.unknownAtRules": "ignore"` for Tailwind v4 compat.

### Security/auth landmines
- B.4 acceptance bug: accept-service unconditionally resets password on existing Supabase user when matching by email. This bricked Colin's super_admin password once. Now mitigated by global email collision check at invite-creation time (Fix A in lib/invitations/service.ts), but the dangerous behavior in accept-service still exists. Worth refactoring in C.3 or sooner.
- middleware.ts public route allowlist: don't forget /api/invitations/accept along with /accept-invite, otherwise the form submission gets redirected to /login mid-submit.
- Supabase password reset email lands at /login losing recovery context. Fix would require adding /auth/callback and recovery URL pattern to public routes. Not yet done.

### Prisma config
- package.json#prisma block is deprecated, will be removed in Prisma 7. Move to prisma.config.ts before then.

## Migration history (in order)
1. 20260507084433_init — initial schema
2. 20260508081943_add_invitations — Invitation model
3. 20260509123159_rls_foundation — buzomed_app role + app_auth helpers (C.1)
4. <C.2a timestamp>_rls_policies — RLS policies (C.2a)
5. 20260510130000_rls_app_role_set_grant — GRANT buzomed_app TO postgres for SQL Editor testing (C.2c)

## Owner preferences
- Detailed comments in security-sensitive code
- Staged rollout with verification checkpoints over big-bang deploys
- Catch failures early with clear errors rather than silent fallbacks
- Don't deploy to production without explicit approval — this repo is dev only

## Suggested next features (session 4 priorities)
1. **Companies + Employees CRUD** — foundational; everything attaches to employees
2. **Workplaces** — sub-units of companies, employees can be assigned
3. **ExaminationTypes** — system-managed reference table (super_admin maintains)
4. **Examinations workflow** — schedule, conduct, document; the actual occupational medicine core
5. **Documents** — fitness certificates, medical reports as PDFs

Companies + Employees is the right session 4 starting point.

## How to start session 4 with Claude
"Continuing Buzomed. Read BUZOMED_HANDOFF.md and prisma/schema.prisma to refresh on current state. Today: build [specific feature]."

If sharing context with Claude.ai (web): paste the GitHub URL or upload a zip of main.
If using Claude Code: just `cd /c/Projects/Buzomed && claude` and reference BUZOMED_HANDOFF.md.
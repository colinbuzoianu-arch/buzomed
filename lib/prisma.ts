import { Prisma, PrismaClient } from '@prisma/client'

/**
 * STATUS NOTE (end of session 3, 2026-05-10):
 *
 *   - Phase C.2c is complete here: `withAuth` is the real transaction-scoped
 *     implementation, and `prismaApp` is wired to DATABASE_URL_APP (direct
 *     connection as the buzomed_app role).
 *   - Phase C.2d is intentionally NOT started: no application route imports
 *     `prismaApp` or `withAuth` yet. Every route still goes through the
 *     admin `prisma` client. The code below exists but is dormant until
 *     the route migration is unblocked.
 *
 *   The blocker is connectivity, not code:
 *     - Supabase's direct endpoint (db.<ref>.supabase.co) is IPv6-only
 *       without the IPv4 add-on, and our dev network has no IPv6 route.
 *     - The session pooler accepts only the `postgres.<ref>` username
 *       format, so we can't authenticate as buzomed_app through it.
 *     - Workarounds (e.g. SET ROLE inside withAuth, dual env-specific
 *       connection strings) were rejected in favor of waiting for the
 *       Supabase Pro plan, which unlocks the IPv4 add-on for direct.
 *
 *   To resume Phase C.2d in a future session:
 *     1. Enable the Supabase IPv4 add-on on the project.
 *     2. Confirm prismaApp connects from the dev machine (a one-shot
 *        `tx.$queryRaw\`SELECT 1\`` inside withAuth is enough).
 *     3. Migrate the four routes listed in BUZOMED_HANDOFF.md one at a
 *        time, committing each separately, per the original C.2d plan.
 */

/**
 * Two Prisma clients.
 *
 * `prisma` (existing, unchanged):
 *   Connects via DATABASE_URL, which today still points at the superuser
 *   pooler. Bypasses RLS. Used by every existing route and server
 *   component. Will continue to be used in C.1 — no behavioral change yet.
 *
 *   Once Phase C.2 is deployed and policies are in place, we will gradually
 *   migrate code to use `prismaApp` instead. `prisma` remains for:
 *     - `accept-service.ts` (creates users before they have auth context)
 *     - migrations and admin scripts
 *     - any future bootstrap operations that need to bypass RLS
 *   We rename it to `prismaAdmin` in C.3.
 *
 * `prismaApp` (new, configured but unused in C.1):
 *   Connects via DATABASE_URL_APP, which points at the same database but
 *   authenticates as the `buzomed_app` role created in C.1's migration.
 *   That role does NOT bypass RLS. Queries through this client are
 *   subject to whatever policies are active.
 *
 *   In C.1, this client exists but nothing uses it yet — RLS isn't
 *   enabled on any table, and policies don't exist. C.2 enables RLS and
 *   adds policies. C.3 starts migrating routes to use `prismaApp`.
 *
 * The `withAuth` wrapper:
 *   Defined here for completeness so C.2 routes can already import it.
 *   In C.1 it's a no-op pass-through (since no RLS is active). In C.2 it
 *   becomes the boundary that sets per-request auth context. The fact
 *   that we ship the no-op version now means C.2 only changes the wrapper
 *   internals, not every call site.
 */

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
  // eslint-disable-next-line no-var
  var prismaApp: PrismaClient | undefined
}

// -----------------------------------------------------------------------------
// Existing superuser client — unchanged
// -----------------------------------------------------------------------------

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

// -----------------------------------------------------------------------------
// New app-role client (RLS-respecting)
//
// Only initialized if DATABASE_URL_APP is set in env. If it's not set,
// importing `prismaApp` returns a proxy that throws on use — so an
// accidental import in C.1 (before we set up the role + connection
// string) fails loudly rather than silently using superuser perms.
// -----------------------------------------------------------------------------

export const prismaApp: PrismaClient =
  globalThis.prismaApp ?? createAppClient()

if (process.env.NODE_ENV !== 'production') globalThis.prismaApp = prismaApp

function createAppClient(): PrismaClient {
  const appUrl = process.env.DATABASE_URL_APP
  if (!appUrl) {
    // Return a proxy that throws on any property access.
    // This makes accidental imports in C.1 fail with a clear message.
    return new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(
            `prismaApp is not configured: DATABASE_URL_APP env var is missing. ` +
              `This client is intended for Phase C.2+. Use \`prisma\` instead, ` +
              `or set DATABASE_URL_APP in .env.local. ` +
              `(Tried to access: ${String(prop)})`
          )
        },
      }
    ) as PrismaClient
  }

  return new PrismaClient({
    datasources: { db: { url: appUrl } },
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  })
}

// -----------------------------------------------------------------------------
// withAuth — runs `fn` with per-request auth context set on the connection.
//
// Phase C.2c implementation: opens an interactive transaction on
// `prismaApp` (the RLS-respecting client), sets three per-request GUCs
// that the `app_auth.*` helpers (defined in the C.1 migration) read from,
// and runs the caller's work inside that transaction. Every query the
// caller issues through `tx` therefore sees row-level security applied
// with the supplied auth context.
//
// Why a transaction:
//   - Prisma's interactive transactions pin a single physical connection
//     for the entire callback. GUCs set with `set_config(..., true)`
//     (transaction-local) are visible to all queries on that connection
//     until COMMIT / ROLLBACK clears them. Without the transaction, GUCs
//     could leak across requests on a pooled connection.
//
// Why set_config(name, value, true) instead of "SET LOCAL":
//   - "SET LOCAL request.jwt.claim.sub = '...'" cannot be parameterized
//     by Prisma — the value is part of the syntax, not a bind variable.
//     Building the SQL via string concatenation would create a
//     SQL-injection foothold the moment any of these claim values is
//     ever derived from untrusted input.
//   - set_config() is a regular SQL function whose three arguments
//     (name, value, is_local) are normal parameters. Prisma's tagged-
//     template `$queryRaw` binds them as proper protocol-level parameters,
//     which is safe by construction.
//
// Why we refuse empty userId:
//   - An empty string in request.jwt.claim.sub causes app_auth.current_user_id()
//     to return NULL — the same state as a fully unauthenticated session.
//     A bug that called withAuth with an empty userId would silently fall
//     into the "logged-out" branch of every policy, which is exactly the
//     kind of failure mode that's hard to spot in code review. Erroring
//     loudly here surfaces the bug at the call site.
// -----------------------------------------------------------------------------

export interface AuthContext {
  /** Application User UUID (NOT the Supabase auth.users id). Required. */
  userId: string
  /**
   * Tenant the user is currently acting within. NULL only for super_admin —
   * who has no tenant — and policies handle that via app_auth.is_super_admin().
   */
  tenantId: string | null
  /** All roles granted to the user, as plain strings (e.g. ["practice_admin"]). */
  roles: string[]
}

export interface WithAuthOptions {
  /**
   * Transaction timeout in milliseconds. Prisma's default for interactive
   * transactions is 5_000. We default to 10_000 because server components
   * sometimes do multi-step reads that brush against 5s on cold caches.
   */
  timeout?: number
  /**
   * Max time to wait for an idle connection from the pool. Prisma default
   * is 2_000. We default to 5_000 to give a little headroom under load.
   */
  maxWait?: number
}

/**
 * Run `fn` with the given auth context applied at the database level via RLS.
 *
 * Usage:
 *
 *   const invitations = await withAuth(authContext, (tx) =>
 *     tx.invitation.findMany({ where: { tenantId: authContext.tenantId } })
 *   )
 *
 * The `tx` argument is a Prisma transaction client bound to `prismaApp`.
 * Treat it as opaque: do NOT reach for the top-level `prisma` (admin)
 * client inside the callback — that would re-enter as the superuser and
 * silently bypass RLS, defeating the purpose of this wrapper.
 */
export async function withAuth<T>(
  ctx: AuthContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: WithAuthOptions
): Promise<T> {
  if (!ctx.userId) {
    throw new Error(
      'withAuth: ctx.userId is required. For genuinely unauthenticated ' +
        'paths (e.g. the public accept-invite flow) use the admin `prisma` ' +
        'client instead.'
    )
  }

  // app_auth helpers treat NULL/empty as "unset", so passing '' for tenantId
  // when the user is super_admin is correct: app_auth.current_tenant_id()
  // will return NULL, and app_auth.is_super_admin() (driven by the roles
  // claim) is what unlocks cross-tenant access in the policies.
  const tenantValue = ctx.tenantId ?? ''
  // Roles are stored as a JSON array in the GUC because GUCs are scalar
  // text and app_auth.current_roles() parses them back into text[].
  const rolesValue = JSON.stringify(ctx.roles ?? [])

  return prismaApp.$transaction(
    async (tx) => {
      // Three sequential round-trips. They MUST run sequentially: each
      // statement needs to commit (well, take effect — these are not real
      // commits) before subsequent statements can rely on the GUC. Doing
      // them via Promise.all could appear to work but is undefined behavior
      // for ordering guarantees on a single transaction client.
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub',    ${ctx.userId},   true)`
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.tenant', ${tenantValue}, true)`
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.roles',  ${rolesValue},  true)`

      return fn(tx)
    },
    {
      timeout: options?.timeout ?? 10_000,
      maxWait: options?.maxWait ?? 5_000,
    }
  )
}


// -----------------------------------------------------------------------------
// authContextFromUser — single conversion point from a User row to AuthContext
//
// Every route that loads a User and then calls withAuth should derive its
// AuthContext through this helper. Rationale:
//   - Centralizing the User → AuthContext mapping keeps the wire format
//     consistent. If we ever add a field (e.g. allowed locationIds for
//     a finer-grained policy) it lands in one place rather than scattering
//     across every call site.
//   - It draws an explicit boundary between Prisma's `UserRole` enum and
//     the plain string[] the policies / GUC consume. This is the only
//     place where that conversion is allowed; everywhere else should
//     treat AuthContext as opaque.
//   - The defensive copy of `roles` means AuthContext owns its array —
//     callers can't surprise themselves by mutating it after the fact.
//
// Accepts a structural shape (not the full User type) so it can be used
// with any select/include shape, e.g. tx.user.findUnique({ select: {
// id: true, tenantId: true, roles: true } }).
// -----------------------------------------------------------------------------

export function authContextFromUser(user: {
  id: string
  tenantId: string | null
  roles: readonly string[]
}): AuthContext {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    roles: [...user.roles],
  }
}

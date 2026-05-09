import { PrismaClient } from '@prisma/client'

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
// Phase C.1: no-op pass-through. Returns whatever fn returns. Does NOT use
//   prismaApp yet, does NOT set GUCs. Lets us write C.2 code that imports
//   this helper and migrate it later without touching call sites.
//
// Phase C.2 (planned):
//   - Open a transaction on prismaApp
//   - SET LOCAL request.jwt.claim.sub      = user.id
//   - SET LOCAL request.jwt.claim.tenant   = user.tenantId
//   - SET LOCAL request.jwt.claim.roles    = JSON.stringify(user.roles)
//   - Run fn(tx) inside the transaction
//   - Settings are scoped to the transaction so concurrency is safe
// -----------------------------------------------------------------------------

export interface AuthContext {
  userId: string
  tenantId: string | null
  roles: string[]
}

/**
 * Run `fn` with the given auth context attached to the database connection.
 *
 * Phase C.1 IMPLEMENTATION (no-op): just calls fn(prisma) and returns
 * the result. Auth context is not actually applied because no RLS is
 * enforced yet. Treat this as forward-compatibility scaffolding.
 *
 * Phase C.2 will replace the body with a real transaction-scoped GUC
 * setup against prismaApp.
 *
 * Usage (will work both now and after C.2):
 *
 *   const invitations = await withAuth(authContext, (tx) =>
 *     tx.invitation.findMany({ where: { tenantId: authContext.tenantId } })
 *   )
 *
 * Note: In C.1 the `tx` argument is the superuser `prisma` client.
 * In C.2 it becomes a transaction client on `prismaApp`. Code that uses
 * `withAuth` should treat `tx` as opaque — don't reach for `prisma`
 * directly inside the callback.
 */
export async function withAuth<T>(
  ctx: AuthContext,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  // C.1: no-op. Just run the callback against the superuser client.
  // Auth context is unused for now.
  // C.2 will replace this body. DO NOT remove the parameter even
  // though it's unused — call sites are stable across phases.
  void ctx
  return fn(prisma)
}

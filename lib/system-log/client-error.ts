import { prisma } from '@/lib/prisma'

/**
 * Persist a CLIENT-side exception (React error boundary, window 'error',
 * or 'unhandledrejection') reported by the browser via /api/client-errors.
 *
 * Why this exists: Vercel's server runtime logs cannot see exceptions that
 * happen purely in the browser (a component that throws while rendering, a
 * DOM reconciliation error from a translate/extension mutation, etc.). Those
 * show the user Next.js's default error screen while leaving zero trace
 * server-side. This reuses the existing `system_error_logs` table — no
 * schema change — tagging client-origin rows with:
 *   - method = 'CLIENT'           (distinguishes them in the System Health list)
 *   - context.category = 'client' (machine-filterable)
 *
 * PRIVACY: this must NEVER receive or store form values, employee names,
 * CNPs, diagnoses, or any page content. The API route that calls this only
 * forwards technical fields (error name/message/stack, component stack,
 * pathname without query, step, user agent, viewport, deployment id, the
 * user-facing reference code) plus the session's userId/tenantId. The
 * `message`/`stack` are already length-capped by the route.
 */
export async function logClientError(params: {
  tenantId: string | null
  userId: string
  pathname: string
  name: string
  message: string
  stack: string | null
  componentStack: string | null
  step: string | null
  userAgent: string | null
  viewport: string | null
  deploymentId: string | null
  referenceCode: string
}): Promise<void> {
  try {
    await prisma.systemErrorLog.create({
      data: {
        tenantId: params.tenantId,
        route: params.pathname,
        method: 'CLIENT',
        errorType: params.name || 'Error',
        message: params.message || '(no message)',
        stackTrace: params.stack,
        // Only IDs / enums / technical strings — no PII, matching the
        // system_error_logs privacy contract.
        context: {
          category: 'client',
          userId: params.userId,
          referenceCode: params.referenceCode,
          step: params.step,
          componentStack: params.componentStack,
          userAgent: params.userAgent,
          viewport: params.viewport,
          deploymentId: params.deploymentId,
        },
      },
    })
  } catch (fallbackErr) {
    // Never let logging failure surface to the client.
    console.error('[client-error-log] DB write failed:', fallbackErr)
  }
}

/**
 * Per-user in-memory rate limit for the client-error endpoint: at most
 * MAX_PER_WINDOW reports per user per hour. A single broken page can fire
 * the window 'error' handler in a loop, so this caps the write volume (and
 * any abuse) without needing Redis. In-memory is acceptable: the worst case
 * on a cold serverless instance is a few extra rows, never missing a real
 * first occurrence.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const MAX_PER_WINDOW = 20
const WINDOW_MS = 60 * 60 * 1000

export function checkClientErrorRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_PER_WINDOW) return false
  entry.count++
  return true
}

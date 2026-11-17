import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { checkClientErrorRateLimit, logClientError } from '@/lib/system-log/client-error'

/**
 * Collect CLIENT-side exceptions the server runtime can't see.
 *
 * Posted to by: the app/global-error and app/(authenticated)/error boundaries
 * and the window 'error' / 'unhandledrejection' listeners installed in the
 * authenticated layout (see components/client-error-reporter.tsx).
 *
 * Guarantees:
 *   - Authenticated users only (401 otherwise) — this is an internal signal.
 *   - Rate-limited to 20 reports / user / hour (a looping error can't flood).
 *   - userId + tenantId come from the SERVER session here, never from the
 *     client payload (can't be spoofed, and keeps us from trusting the page).
 *   - Only technical fields are stored; the route truncates message/stack and
 *     drops anything else. The client is contracted to send no PII.
 */

const MAX_MESSAGE = 500
const MAX_STACK = 4000
const MAX_COMPONENT_STACK = 4000
const MAX_SHORT = 300

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '') return null
  return t.length > max ? t.slice(0, max) : t
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!checkClientErrorRateLimit(auth.user.id)) {
    // Silently accept-but-drop so the client never retries or surfaces this.
    return NextResponse.json({ ok: true, throttled: true }, { status: 202 })
  }

  let body: Record<string, unknown>
  try {
    const raw = await request.json()
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  await logClientError({
    tenantId: auth.user.tenantId ?? null,
    userId: auth.user.id,
    // pathname is sent WITHOUT query string by the client; still, strip any
    // stray query/hash defensively so no value ever lands in the route column.
    pathname: (str(body.pathname, MAX_SHORT) ?? '/').split(/[?#]/)[0],
    name: str(body.name, 200) ?? 'Error',
    message: str(body.message, MAX_MESSAGE) ?? '(no message)',
    stack: str(body.stack, MAX_STACK),
    componentStack: str(body.componentStack, MAX_COMPONENT_STACK),
    step: str(body.step, 40),
    userAgent: str(body.userAgent, MAX_SHORT),
    viewport: str(body.viewport, 20),
    deploymentId: str(body.deploymentId, 100),
    referenceCode: str(body.referenceCode, 40) ?? 'unknown',
  })

  return NextResponse.json({ ok: true }, { status: 202 })
}

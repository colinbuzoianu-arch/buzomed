/**
 * Client-side helper that ships a browser exception to /api/client-errors.
 *
 * Shared by the error boundaries (app/global-error.tsx,
 * app/(authenticated)/error.tsx) and the global window listeners
 * (components/client-error-reporter.tsx).
 *
 * PRIVACY CONTRACT: this sends ONLY technical metadata — never form values,
 * employee names, CNPs, or page content. In particular `pathname` is taken
 * from location.pathname (query string dropped), and no DOM text is read
 * except the examination step marker in the URL.
 */

/** A short, human-quotable reference the user can read back to support. */
export function generateErrorReference(): string {
  const t = Date.now().toString(36).slice(-5).toUpperCase()
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ERR-${t}-${r}`
}

/**
 * Current examination step, when on the stepper, read from the `?step=`
 * query param the stepper keeps in the URL (examination-stepper.tsx syncs
 * activeStep there). Returns null when not on an examination page.
 */
function currentExamStep(): string | null {
  try {
    const { pathname, search } = window.location
    // /examinations/<id> but not /new, /fisa, etc.
    if (!/^\/examinations\/[^/]+\/?$/.test(pathname)) return null
    if (pathname.endsWith('/new')) return null
    const step = new URLSearchParams(search).get('step')
    // Default step index is 0 when the param hasn't been set yet.
    return step ?? '0'
  } catch {
    return null
  }
}

function deploymentId(): string | null {
  // Exposed to the client when VERCEL_DEPLOYMENT_ID is re-exported as
  // NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID in the Vercel project env.
  return process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? null
}

export interface ClientErrorInput {
  error: unknown
  componentStack?: string | null
  referenceCode: string
  /** 'boundary-global' | 'boundary-authenticated' | 'window-error' | 'unhandledrejection' */
  source: string
}

/**
 * Fire-and-forget. Swallows every failure: error reporting must never throw
 * or block, least of all from inside an error boundary.
 */
export function reportClientError(input: ClientErrorInput): void {
  try {
    const err = input.error
    const name = err instanceof Error ? err.name : typeof err
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? (err.stack ?? null) : null

    const payload = {
      source: input.source,
      name,
      message,
      stack,
      componentStack: input.componentStack ?? null,
      // pathname WITHOUT query string — never carries field values.
      pathname: window.location.pathname,
      step: currentExamStep(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      deploymentId: deploymentId(),
      referenceCode: input.referenceCode,
    }

    const url = '/api/client-errors'
    const bodyStr = JSON.stringify(payload)

    // keepalive so the report survives a navigation/reload the user may
    // trigger right after seeing the error screen.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never let the reporter itself throw.
  }
}

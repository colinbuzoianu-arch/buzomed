'use client'

import { useEffect } from 'react'
import { generateErrorReference, reportClientError } from '@/lib/client-errors/report'

/**
 * Installs global window listeners that forward uncaught browser exceptions
 * and unhandled promise rejections to /api/client-errors. Rendered once in
 * the authenticated layout.
 *
 * These complement the React error boundaries (which only catch errors thrown
 * during render/lifecycle of the component tree): plenty of real crashes —
 * event handlers, async callbacks, third-party scripts, Google-Translate /
 * extension DOM mutations — surface as window 'error' or 'unhandledrejection'
 * instead, and would otherwise be invisible (no server log either).
 *
 * Renders nothing. A module-level guard makes the install idempotent across
 * React Strict Mode double-invokes and layout remounts.
 */

let installed = false

export function ClientErrorReporter() {
  useEffect(() => {
    if (installed) return
    installed = true

    const onError = (event: ErrorEvent) => {
      reportClientError({
        error: event.error ?? event.message,
        referenceCode: generateErrorReference(),
        source: 'window-error',
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError({
        error: event.reason,
        referenceCode: generateErrorReference(),
        source: 'unhandledrejection',
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      installed = false
    }
  }, [])

  return null
}

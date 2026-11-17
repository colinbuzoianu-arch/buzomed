'use client'

import { useEffect, useState } from 'react'
import { generateErrorReference, reportClientError } from '@/lib/client-errors/report'

/**
 * Error boundary for the authenticated app segment. Catches exceptions thrown
 * while rendering any authenticated page (examination stepper included) and,
 * instead of Next.js's bare default screen, shows a Romanian message with a
 * quotable reference code and recovery actions — while reporting the error to
 * /api/client-errors so we can actually see it.
 */
export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Stable per mounted error so the user sees the same code we store.
  const [reference] = useState(generateErrorReference)

  useEffect(() => {
    reportClientError({
      error,
      referenceCode: reference,
      source: 'boundary-authenticated',
    })
  }, [error, reference])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">A apărut o eroare la afișarea paginii</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ne pare rău — pagina nu a putut fi afișată corect. Poți reîncerca sau reîncărca
          pagina. Dacă problema persistă, trimite codul de mai jos la suport.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Reîncearcă
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Reîncarcă pagina
          </button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Cod referință: <span className="font-mono">{reference}</span>
        </p>
      </div>
    </div>
  )
}

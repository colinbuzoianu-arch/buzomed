'use client'

import { useEffect, useState } from 'react'
import { generateErrorReference, reportClientError } from '@/lib/client-errors/report'

/**
 * Last-resort error boundary: catches errors thrown in the ROOT layout itself,
 * where the segment error boundaries can't reach. It replaces the whole
 * document, so it must render its own <html>/<body> and cannot rely on the
 * app's CSS being present — hence inline styles.
 *
 * Still reports to /api/client-errors and shows the same Romanian message,
 * reference code, and recovery actions.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reference] = useState(generateErrorReference)

  useEffect(() => {
    reportClientError({
      error,
      referenceCode: reference,
      source: 'boundary-global',
    })
  }, [error, reference])

  return (
    <html lang="ro" translate="no">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
          padding: 24,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            textAlign: 'center',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            background: '#ffffff',
            padding: 24,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            A apărut o eroare la afișarea paginii
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>
            Ne pare rău — pagina nu a putut fi afișată corect. Poți reîncerca sau reîncărca
            pagina. Dacă problema persistă, trimite codul de mai jos la suport.
          </p>
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                background: '#1e3a8a',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Reîncearcă
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              Reîncarcă pagina
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 16 }}>
            Cod referință: <span style={{ fontFamily: 'monospace' }}>{reference}</span>
          </p>
        </div>
      </body>
    </html>
  )
}

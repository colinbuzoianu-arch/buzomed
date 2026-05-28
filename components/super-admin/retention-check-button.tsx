'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toastError } from '@/lib/toast'

type RetentionResult = {
  tenantName: string
  tenantId: string
  expiredExaminations: number
  expiredDocuments: number
  retentionYears: number
  oldestExpiredDate: string | null
}

export function RetentionCheckButton() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<RetentionResult[] | null>(null)

  async function handleCheck() {
    setLoading(true)
    setResults(null)
    try {
      const res = await fetch('/api/admin/check-retention', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toastError('Eroare la verificare.'); return }
      setResults(data.results ?? [])
    } catch {
      toastError('Eroare de conexiune.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={handleCheck} disabled={loading}>
        {loading ? 'Se verifică...' : 'Verifică retenție date'}
      </Button>

      {results !== null && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-green-700">
              ✓ Toate datele sunt în termen. Nicio acțiune necesară.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {results.length} {results.length === 1 ? 'cabinet are' : 'cabinete au'} date
                care depășesc perioada de retenție configurată.
              </p>
              <div className="border rounded-lg divide-y">
                {results.map(r => (
                  <div key={r.tenantId} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.tenantName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.expiredExaminations} examinări · {r.expiredDocuments} documente
                        · retenție {r.retentionYears} ani
                        {r.oldestExpiredDate && ` · cel mai vechi: ${r.oldestExpiredDate}`}
                      </p>
                    </div>
                    <Link
                      href={`/super-admin/tenants/${r.tenantId}`}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Vezi cabinet →
                    </Link>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Ștergerea datelor expirate se face manual din pagina fiecărui cabinet,
                cu confirmare explicită. Nu există ștergere automată.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

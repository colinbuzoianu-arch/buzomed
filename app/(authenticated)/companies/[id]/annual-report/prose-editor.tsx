'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  payload: {
    companyName: string
    year: number
    totalExams: number
    signed: number
    apt: number
    apt_conditionat: number
    inapt_temporar: number
    inapt: number
    workers: number
    workplaces: number
    topHazards: string[]
    locale: string
  }
  labels: {
    generate: string
    generating: string
    editHint: string
    apiKeyMissing: string
    error: string
    sectionTitle: string
  }
}

export function ProseEditor({ payload, labels }: Props) {
  const [prose, setProse] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<'api_key' | 'failed' | null>(null)

  async function generate() {
    setBusy(true)
    setErrorKey(null)
    try {
      const res = await fetch('/api/reports/annual/prose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorKey(data.error === 'api_key_missing' ? 'api_key' : 'failed')
        return
      }
      setProse(data.prose ?? '')
    } catch {
      setErrorKey('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{labels.sectionTitle}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={busy}
          className="print:hidden"
        >
          {busy ? labels.generating : labels.generate}
        </Button>
      </div>

      {errorKey && (
        <p className="text-sm text-destructive">
          {errorKey === 'api_key' ? labels.apiKeyMissing : labels.error}
        </p>
      )}

      {prose || busy ? (
        <>
          <textarea
            value={prose}
            onChange={(e) => setProse(e.target.value)}
            disabled={busy}
            rows={8}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60 print:border-none print:p-0 print:resize-none"
          />
          <p className="text-xs text-muted-foreground print:hidden">{labels.editHint}</p>
        </>
      ) : null}
    </section>
  )
}

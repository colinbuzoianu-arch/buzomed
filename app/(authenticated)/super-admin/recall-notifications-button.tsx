'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function RecallNotificationsButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null)
  const [error, setError] = useState(false)

  async function handleClick() {
    setLoading(true)
    setResult(null)
    setError(false)
    try {
      const res = await fetch('/api/admin/trigger-recall-notifications', {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={handleClick} disabled={loading}>
        {loading ? 'Se trimite...' : 'Trimite notificări scadențe'}
      </Button>
      {result !== null && (
        <p className="text-xs text-muted-foreground">
          {result.sent} {result.sent === 1 ? 'email trimis' : 'email-uri trimise'},{' '}
          {result.skipped} omise (fără email)
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive">
          Eroare la trimiterea notificărilor.
        </p>
      )}
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Destructive "cancel import" control (spec §8). Guards behind a typed
 * confirmation because it soft-deletes employees. Conservative server side:
 * only employees without examinations are removed.
 */
export function CancelImportButton({
  jobId,
  createdCount,
}: {
  jobId: string
  createdCount: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ removed: number; kept: number } | null>(null)

  async function handleCancel() {
    const ok = window.confirm(
      `Anulezi importul?\n\nAngajații creați de acest import care NU au încă examinări (până la ${createdCount}) vor fi șterși (soft-delete), împreună cu rechemările importate. Cei cu examinări se păstrează. Companiile și locurile de muncă rămân neatinse.\n\nAcțiunea nu se poate anula.`
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/employees/import/jobs/${jobId}/cancel`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.error === 'forbidden'
            ? 'Doar un practice_admin poate anula un import.'
            : 'Anularea a eșuat.'
        )
        return
      }
      setDone({ removed: data.removed ?? 0, kept: data.kept ?? 0 })
      router.refresh()
    } catch {
      setError('Eroare de rețea.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Import anulat — {done.removed} angajați eliminați, {done.kept} păstrați (au examinări).
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Button variant="destructive" size="sm" onClick={handleCancel} disabled={busy}>
        {busy ? 'Se anulează…' : 'Anulează import'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

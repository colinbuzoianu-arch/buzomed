'use client'

import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Labels {
  resetButton: string
  confirm: string // "{name}" placeholder
  success: string
  error: string
  resetting: string
}

/** Super-admin only: wipe a user's 2FA factors after a lost device. */
export function Reset2faButton({
  userId,
  userDisplayName,
  labels,
}: {
  userId: string
  userDisplayName: string
  labels: Labels
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    if (!confirm(labels.confirm.replace('{name}', userDisplayName))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/reset-2fa`, { method: 'POST' })
      if (!res.ok) {
        setError(labels.error)
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError(labels.error)
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button variant="outline" size="sm" onClick={handleReset} disabled={busy}>
        <KeyRound className="h-3.5 w-3.5 mr-1" />
        {busy ? labels.resetting : labels.resetButton}
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  )
}

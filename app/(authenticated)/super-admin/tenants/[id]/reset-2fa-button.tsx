'use client'

import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/lib/toast'

interface Labels {
  resetButton: string
  confirm: string
  /** "{count}" placeholder for the number of factors removed. */
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

  async function handleReset() {
    if (!confirm(labels.confirm)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/users/${userId}/reset-mfa`, { method: 'POST' })
      if (!res.ok) {
        toastError(labels.error)
        setBusy(false)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { removed?: number }
      toastSuccess(labels.success.replace('{count}', String(data.removed ?? 0)), userDisplayName)
      router.refresh()
    } catch {
      toastError(labels.error)
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReset} disabled={busy}>
      <KeyRound className="h-3.5 w-3.5 mr-1" />
      {busy ? labels.resetting : labels.resetButton}
    </Button>
  )
}

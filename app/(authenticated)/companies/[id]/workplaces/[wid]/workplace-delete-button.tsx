'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  companyId: string
  workplaceId: string
  workplaceName: string
  hasAssignments: boolean
  labels: {
    delete: string
    deleteConfirm: string
    deleteConfirmWithAssignments: string
    deleting: string
    errorMessage: string
  }
}

export function WorkplaceDeleteButton({
  companyId,
  workplaceId,
  workplaceName,
  hasAssignments,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    const message = hasAssignments
      ? labels.deleteConfirmWithAssignments.replace('{name}', workplaceName)
      : labels.deleteConfirm.replace('{name}', workplaceName)
    if (!confirm(message)) return

    setDeleting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/companies/${companyId}/workplaces/${workplaceId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        setDeleting(false)
        return
      }
      startTransition(() => {
        router.push(`/companies/${companyId}`)
        router.refresh()
      })
    } catch (err) {
      console.error('Delete failed', err)
      setError(labels.errorMessage)
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={deleting}
        className="text-destructive hover:text-destructive"
      >
        {deleting ? labels.deleting : labels.delete}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

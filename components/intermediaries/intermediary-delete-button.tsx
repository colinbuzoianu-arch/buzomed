'use client'

import { useRouter } from 'next/navigation'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { TOAST } from '@/lib/toast'

interface Props {
  intermediaryId: string
  intermediaryName: string
  labels: {
    delete: string
    deleteConfirm: string
    deleting: string
    errorMessage: string
  }
}

export function IntermediaryDeleteButton({ intermediaryId, intermediaryName, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!confirm(labels.deleteConfirm.replace('{name}', intermediaryName))) return
    setDeleting(true)
    setError(null)
    try {
      const response = await fetch(`/api/intermediaries/${intermediaryId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        setDeleting(false)
        return
      }
      TOAST.saved()
      startTransition(() => {
        router.push('/intermediaries')
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

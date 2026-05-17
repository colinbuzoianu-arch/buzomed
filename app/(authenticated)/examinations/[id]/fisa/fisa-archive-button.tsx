'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  examinationId: string
  alreadyArchived: boolean
  labels: {
    save: string
    saving: string
    saved: string
    error: string
  }
}

export function FisaArchiveButton({ examinationId, alreadyArchived, labels }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>(
    alreadyArchived ? 'done' : 'idle'
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSave() {
    if (state === 'saving' || state === 'done') return
    setState('saving')
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/examinations/${examinationId}/archive-fisa`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data.message || labels.error)
        setState('error')
        return
      }
      setState('done')
      router.refresh()
    } catch {
      setErrorMsg(labels.error)
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-700 px-3 py-2">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        {labels.saved}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={state === 'saving'}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {state === 'saving' ? labels.saving : labels.save}
      </button>
      {state === 'error' && errorMsg && (
        <span className="text-xs text-destructive">{errorMsg}</span>
      )}
    </div>
  )
}

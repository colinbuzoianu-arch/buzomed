'use client'

import { useState } from 'react'

export function ResendInviteButton({ registrationId }: { registrationId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    setState('loading')
    try {
      const res = await fetch(`/api/register-requests/${registrationId}/resend`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Eroare necunoscută')
        setState('error')
        return
      }
      setState('done')
    } catch {
      setErrorMsg('Conexiune eșuată')
      setState('error')
    }
  }

  if (state === 'done') {
    return <span className="text-xs text-emerald-700 font-medium">Trimis ✓</span>
  }

  if (state === 'error') {
    return (
      <span className="text-xs text-destructive" title={errorMsg}>
        Eroare
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="text-xs border rounded px-2 py-1 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {state === 'loading' ? 'Se trimite...' : 'Retrimite invitația'}
    </button>
  )
}

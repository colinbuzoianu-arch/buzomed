'use client'

import { useState, useEffect } from 'react'

export type PrefillStatus = 'idle' | 'loading' | 'done' | 'error'

export interface PrefillSuggestion {
  value: unknown
  confidence: 'high' | 'med' | 'low'
}

export interface UseExaminationPrefillResult {
  suggestions: Record<string, PrefillSuggestion>
  status: PrefillStatus
}

export function useExaminationPrefill(
  examinationId: string,
  enabled: boolean
): UseExaminationPrefillResult {
  const [suggestions, setSuggestions] = useState<Record<string, PrefillSuggestion>>({})
  const [status, setStatus] = useState<PrefillStatus>('idle')

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    setStatus('loading')

    fetch('/api/ai/examination-prefill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examinationId }),
    })
      .then((res) => res.json())
      .then((data: { suggestions?: Record<string, PrefillSuggestion> }) => {
        if (!cancelled) {
          setSuggestions(data.suggestions ?? {})
          setStatus('done')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [enabled, examinationId])

  return { suggestions, status }
}

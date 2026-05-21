'use client'

import { useState, useEffect, useRef } from 'react'

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
  const inflight = useRef(false)

  useEffect(() => {
    if (!enabled || inflight.current) return
    inflight.current = true
    setStatus('loading')

    fetch('/api/ai/examination-prefill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examinationId }),
    })
      .then((res) => res.json())
      .then((data: { suggestions?: Record<string, PrefillSuggestion> }) => {
        setSuggestions(data.suggestions ?? {})
        setStatus('done')
      })
      .catch(() => {
        setStatus('error')
      })
      .finally(() => {
        inflight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // fires once on mount when enabled

  return { suggestions, status }
}

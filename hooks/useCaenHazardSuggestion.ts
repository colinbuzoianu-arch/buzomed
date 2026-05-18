'use client'

import { useState, useCallback, useRef } from 'react'

export interface CaenHazardSuggestionData {
  hazards: string[]
  intervalMonths: number
  examinationTypes: string[]
  rationale: string
}

export interface UseCaenHazardSuggestion {
  suggest: () => void
  data: CaenHazardSuggestionData | null
  loading: boolean
  error: string | null
  dismiss: () => void
}

export function useCaenHazardSuggestion(
  caenCode: string | null | undefined
): UseCaenHazardSuggestion {
  const [data, setData] = useState<CaenHazardSuggestionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Prevent double-firing in React strict mode / concurrent renders.
  const inflight = useRef(false)

  const isValidCaen = /^\d{4}$/.test((caenCode ?? '').trim())

  const suggest = useCallback(async () => {
    if (!isValidCaen || dismissed || inflight.current) return
    inflight.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/caen-hazard-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caenCode: (caenCode ?? '').trim() }),
      })

      if (res.status === 503) {
        // API key not configured — silently hide the feature.
        return
      }

      if (!res.ok) {
        setError('suggestion_failed')
        return
      }

      const json: CaenHazardSuggestionData = await res.json()
      if (json.hazards?.length > 0) {
        setData(json)
      }
    } catch {
      setError('suggestion_failed')
    } finally {
      setLoading(false)
      inflight.current = false
    }
  }, [caenCode, isValidCaen, dismissed])

  const dismiss = useCallback(() => {
    setDismissed(true)
    setData(null)
    setError(null)
  }, [])

  return { suggest, data, loading, error, dismiss }
}

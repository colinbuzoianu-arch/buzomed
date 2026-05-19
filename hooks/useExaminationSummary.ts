'use client'

import { useState, useEffect, useRef } from 'react'

export interface ExaminationSummaryResult {
  summary: string | null
  loading: boolean
  error: string | null
  examinationCount: number
}

export function useExaminationSummary(
  currentExaminationId: string,
  employeeId: string
): ExaminationSummaryResult {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [examinationCount, setExaminationCount] = useState(0)
  const inflight = useRef(false)

  useEffect(() => {
    if (inflight.current) return
    inflight.current = true

    fetch('/api/ai/examination-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentExaminationId, employeeId }),
    })
      .then((res) => res.json())
      .then(
        (data: {
          summary: string | null
          reason?: string
          examinationCount: number
        }) => {
          setSummary(data.summary ?? null)
          setExaminationCount(data.examinationCount ?? 0)
        }
      )
      .catch(() => {
        setSummary(null)
      })
      .finally(() => {
        setLoading(false)
        inflight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally fires once on mount — IDs are stable per page load

  return { summary, loading, error, examinationCount }
}

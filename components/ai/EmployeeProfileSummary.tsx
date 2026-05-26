'use client'

import { useState, useEffect, useRef } from 'react'

interface SummaryResult {
  summary: string | null
  examinationCount: number
  loading: boolean
}

function useSummary(employeeId: string): SummaryResult {
  const [summary, setSummary] = useState<string | null>(null)
  const [examinationCount, setExaminationCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const inflight = useRef(false)

  useEffect(() => {
    if (inflight.current) return
    inflight.current = true

    fetch('/api/ai/examination-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId }),
    })
      .then((res) => res.json())
      .then((data: { summary: string | null; examinationCount: number }) => {
        setSummary(data.summary ?? null)
        setExaminationCount(data.examinationCount ?? 0)
      })
      .catch(() => setSummary(null))
      .finally(() => {
        setLoading(false)
        inflight.current = false
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { summary, examinationCount, loading }
}

interface Props {
  employeeId: string
}

export function EmployeeProfileSummary({ employeeId }: Props) {
  const { summary, examinationCount, loading } = useSummary(employeeId)
  const [skeletonVisible, setSkeletonVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setSkeletonVisible(false), 3500)
    return () => clearTimeout(t)
  }, [])

  if (loading) {
    if (!skeletonVisible) return null
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
        <div className="h-3.5 bg-[hsl(var(--surface-muted))] rounded w-36" />
        <div className="space-y-2 pt-1">
          <div className="h-3 bg-[hsl(var(--surface-muted))] rounded" />
          <div className="h-3 bg-[hsl(var(--surface-muted))] rounded w-10/12" />
          <div className="h-3 bg-[hsl(var(--surface-muted))] rounded w-8/12" />
        </div>
        <div className="h-2.5 bg-[hsl(var(--surface-muted))] rounded w-48 pt-1" />
      </div>
    )
  }

  if (!summary || examinationCount === 0) return null

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-[hsl(var(--text-muted))] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 3a3 3 0 00-3 3v4a6 6 0 0012 0V6a3 3 0 00-3-3M9 3h6M12 16v3m0 0a3 3 0 003 3H9a3 3 0 003-3z"
            />
          </svg>
          <span className="text-[13px] font-medium text-foreground">
            Profil clinic
          </span>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[hsl(var(--surface-tinted))] text-primary uppercase tracking-wide leading-none">
          AI
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-foreground/90">
        {summary}
      </p>

      <div className="border-t pt-2.5 space-y-0.5">
        <p className="text-[11px] text-[hsl(var(--text-muted))]">
          Bazat pe {examinationCount}{' '}
          {examinationCount === 1 ? 'examinare semnată' : 'examinări semnate'}.
        </p>
        <p className="text-[10px] text-[hsl(var(--text-faint))]">
          Rezumat orientativ. Verificați dosarul complet înainte de orice decizie clinică.
        </p>
      </div>
    </div>
  )
}

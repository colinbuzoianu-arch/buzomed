'use client'

import { useEffect, useState } from 'react'
import { useExaminationSummary } from '@/hooks/useExaminationSummary'

interface Props {
  currentExaminationId: string
  employeeId: string
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-muted rounded w-28" />
        <div className="h-4 w-5 bg-muted rounded" />
      </div>
      <div className="space-y-2 pt-1">
        <div className="h-3 bg-muted rounded" />
        <div className="h-3 bg-muted rounded w-11/12" />
        <div className="h-3 bg-muted rounded w-4/6" />
      </div>
    </div>
  )
}

export function ExaminationHistorySummary({
  currentExaminationId,
  employeeId,
}: Props) {
  const { summary, loading, examinationCount } = useExaminationSummary(
    currentExaminationId,
    employeeId
  )
  // Hide skeleton after 3 s — if AI hasn't responded by then, show nothing
  const [skeletonVisible, setSkeletonVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setSkeletonVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return skeletonVisible ? <SkeletonCard /> : null
  }

  if (!summary) return null

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {/* Clock icon — inline SVG to avoid any icon library dependency */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-muted-foreground flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
          Istoric examinări
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
          AI
        </span>
      </div>

      {/* Summary text */}
      <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>

      {/* Footer */}
      <div className="space-y-0.5 border-t pt-2">
        <p className="text-xs text-muted-foreground">
          Bazat pe {examinationCount}{' '}
          {examinationCount === 1 ? 'examinare anterioară semnată' : 'examinări anterioare semnate'}.
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Rezumat orientativ generat automat. Verificați dosarul complet.
        </p>
      </div>
    </div>
  )
}

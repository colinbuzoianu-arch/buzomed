'use client'

import { useState, useEffect, useRef } from 'react'
import type { InvestigationSuggestionsResult, InvestigationRecommendation } from '@/app/api/ai/investigation-suggestions/route'

interface Props {
  examinationId: string
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-muted rounded w-36" />
        <div className="h-4 w-5 bg-muted rounded" />
      </div>
      <div className="space-y-2.5 pt-1">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
        <div className="h-3 bg-muted rounded w-4/6" />
      </div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: InvestigationRecommendation['priority'] }) {
  if (priority === 'obligatorie') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-red-50 text-red-700 border-red-200 whitespace-nowrap flex-shrink-0">
        Obligatorie
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap flex-shrink-0">
      Recomandată
    </span>
  )
}

export function InvestigationRecommender({ examinationId }: Props) {
  const [result, setResult] = useState<InvestigationSuggestionsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [skeletonVisible, setSkeletonVisible] = useState(true)
  const inflight = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setSkeletonVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (inflight.current) return
    inflight.current = true

    fetch('/api/ai/investigation-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examinationId }),
    })
      .then((res) => res.json())
      .then((data: InvestigationSuggestionsResult) => setResult(data))
      .catch(() => setResult(null))
      .finally(() => {
        setLoading(false)
        inflight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return skeletonVisible ? <SkeletonCard /> : null
  }

  if (!result || result.recommendations.length === 0) return null

  const mandatory = result.recommendations.filter((r) => r.priority === 'obligatorie')
  const recommended = result.recommendations.filter((r) => r.priority !== 'obligatorie')

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
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
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          Investigații recomandate
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide leading-none">
          AI
        </span>
      </div>

      {/* AI summary */}
      {result.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>
      )}

      {/* Mandatory investigations */}
      {mandatory.length > 0 && (
        <div className="space-y-2">
          {mandatory.map((r) => (
            <RecommendationRow key={r.investigation} rec={r} />
          ))}
        </div>
      )}

      {/* Recommended investigations */}
      {recommended.length > 0 && (
        <>
          {mandatory.length > 0 && <div className="border-t" />}
          <div className="space-y-2">
            {recommended.map((r) => (
              <RecommendationRow key={r.investigation} rec={r} />
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="border-t pt-2 space-y-0.5">
        <p className="text-xs text-muted-foreground">
          Bazat pe {result.hazardCount}{' '}
          {result.hazardCount === 1 ? 'factor de risc activ' : 'factori de risc activi'}.
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Sugestii orientative. Medicul decide investigațiile finale.
        </p>
      </div>
    </div>
  )
}

function RecommendationRow({ rec }: { rec: InvestigationRecommendation }) {
  return (
    <div className="flex items-start gap-2">
      <PriorityBadge priority={rec.priority} />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{rec.investigation}</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{rec.basis}</p>
      </div>
    </div>
  )
}

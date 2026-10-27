'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Clickable overview tiles above the employees filters (active tab only).
 * Each tile = count + label; clicking sets/clears its filter in the URL,
 * single-selecting across the overview dimensions (recall / status / wp) so
 * the resulting list matches the tile's count. Search (q), company and sort
 * are preserved. Counts are computed server-side and passed in.
 */

export interface OverviewCounts {
  activi: number
  overdue: number
  soon: number
  never: number
  noWorkplace: number
  missingData: number
}

interface Labels {
  activi: string
  overdue: string
  soon: string
  never: string
  noWorkplace: string
  missingData: string
}

interface Props {
  counts: OverviewCounts
  /** current overview-dimension params */
  recall: string
  status: string
  wp: string
  labels: Labels
}

type Tone = 'neutral' | 'red' | 'amber'

export function EmployeeOverviewStrip({ counts, recall, status, wp, labels }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const noOverview = recall === '' && status === '' && wp !== 'no_workplace'

  const tiles: Array<{
    key: string
    label: string
    count: number
    tone: Tone
    active: boolean
    target: { recall?: string; status?: string; wp?: string } | null
  }> = [
    { key: 'activi', label: labels.activi, count: counts.activi, tone: 'neutral', active: noOverview, target: null },
    { key: 'overdue', label: labels.overdue, count: counts.overdue, tone: 'red', active: recall === 'overdue', target: { recall: 'overdue' } },
    { key: 'soon', label: labels.soon, count: counts.soon, tone: 'amber', active: recall === 'soon', target: { recall: 'soon' } },
    { key: 'never', label: labels.never, count: counts.never, tone: 'neutral', active: status === 'never', target: { status: 'never' } },
    { key: 'noWorkplace', label: labels.noWorkplace, count: counts.noWorkplace, tone: 'neutral', active: wp === 'no_workplace', target: { wp: 'no_workplace' } },
    { key: 'missingData', label: labels.missingData, count: counts.missingData, tone: 'neutral', active: status === 'missing_data', target: { status: 'missing_data' } },
  ]

  function hrefFor(active: boolean, target: { recall?: string; status?: string; wp?: string } | null) {
    const params = new URLSearchParams(searchParams.toString())
    // Overview dimensions are single-select; always reset them, then apply.
    params.delete('recall')
    params.delete('status')
    params.delete('wp')
    params.delete('page')
    if (!active && target) {
      if (target.recall) params.set('recall', target.recall)
      if (target.status) params.set('status', target.status)
      if (target.wp) params.set('wp', target.wp)
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const toneClasses: Record<Tone, { dot: string; activeRing: string; count: string }> = {
    neutral: { dot: 'bg-muted-foreground/40', activeRing: 'border-primary ring-1 ring-primary/30 bg-[hsl(var(--surface-tinted))]', count: 'text-foreground' },
    red: { dot: 'bg-red-500', activeRing: 'border-red-400 ring-1 ring-red-300 bg-red-50 dark:bg-red-950/40', count: 'text-red-700 dark:text-red-300' },
    amber: { dot: 'bg-amber-500', activeRing: 'border-amber-400 ring-1 ring-amber-300 bg-amber-50 dark:bg-amber-950/40', count: 'text-amber-700 dark:text-amber-300' },
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map((tile) => {
        const tc = toneClasses[tile.tone]
        return (
          <Link
            key={tile.key}
            href={hrefFor(tile.active, tile.target)}
            aria-pressed={tile.active}
            className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50 ${
              tile.active ? tc.activeRing : 'border-border'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tc.dot}`} aria-hidden />
              <span className={`text-lg font-semibold tabular-nums leading-none ${tc.count}`}>
                {tile.count}
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground leading-tight">{tile.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

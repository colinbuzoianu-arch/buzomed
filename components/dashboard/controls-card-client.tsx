'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ControlRow {
  id: string
  employeeId: string
  name: string
  company: string
  dueDateLabel: string
  /** Signed day delta vs today: negative = overdue by N, positive = N left. */
  days: number
}

interface Labels {
  title: string
  tabOverdue: string
  tabSoon: string
  viewAll: string
  emptyOverdue: string
  emptySoon: string
  daysOverdue: string
  daysLeft: string
  dueToday: string
}

export function ControlsCardClient({
  overdue,
  soon,
  overdueCount,
  soonCount,
  labels,
  basePath = '',
}: {
  overdue: ControlRow[]
  soon: ControlRow[]
  overdueCount: number
  soonCount: number
  labels: Labels
  /** Prefix for internal hrefs: '' for the real app, '/sandbox' for the demo. */
  basePath?: string
}) {
  const [tab, setTab] = useState<'overdue' | 'soon'>(
    overdueCount > 0 || soonCount === 0 ? 'overdue' : 'soon'
  )

  const rows = tab === 'overdue' ? overdue : soon
  const empty = tab === 'overdue' ? labels.emptyOverdue : labels.emptySoon
  const viewAllHref =
    tab === 'overdue'
      ? `${basePath}/examinations?tab=scadente&horizon=overdue`
      : `${basePath}/examinations?tab=scadente&horizon=thisMonth`

  function badge(days: number): { text: string; cls: string } {
    if (days < 0) {
      return {
        text: labels.daysOverdue.replace('{n}', String(-days)),
        cls: 'text-destructive border-destructive/30 bg-destructive/5',
      }
    }
    if (days === 0) {
      return { text: labels.dueToday, cls: 'text-amber-700 border-amber-200 bg-amber-50/60' }
    }
    return {
      text: labels.daysLeft.replace('{n}', String(days)),
      cls: 'text-muted-foreground border-border',
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{labels.title}</h2>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          {labels.viewAll}
        </Link>
      </header>

      <div className="flex gap-1 px-3 pt-3">
        <button
          type="button"
          onClick={() => setTab('overdue')}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tab === 'overdue'
              ? 'bg-destructive/10 text-destructive'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {labels.tabOverdue} ({overdueCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('soon')}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            tab === 'soon' ? 'bg-secondary' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {labels.tabSoon} ({soonCount})
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y">
          {rows.map((r) => {
            const b = badge(r.days)
            return (
              <li key={r.id}>
                <Link
                  href={`${basePath}/employees/${r.employeeId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.company} · {r.dueDateLabel}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                      b.cls
                    )}
                  >
                    {b.text}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

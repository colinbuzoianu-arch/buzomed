'use client'

import type { ReactNode } from 'react'

/**
 * Shared chart theme. recharts needs concrete colour strings (not Tailwind
 * classes), so semantic colours are CSS variables defined here with light +
 * dark values and consumed as `var(--chart-*)`. The values match the existing
 * text-*-700 verdict hues, with lighter dark-mode steps for contrast on the
 * dark surface.
 *
 * Verdict colours are STATUS colours (fixed meaning, never reused for an
 * arbitrary series); identity is always reinforced by a legend + direct
 * labels + the Romanian tooltip, never by colour alone.
 */

export const VERDICT_KEYS = ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const
export type VerdictKey = (typeof VERDICT_KEYS)[number]

export const VERDICT_COLOR: Record<VerdictKey, string> = {
  apt: 'var(--chart-apt)',
  apt_conditionat: 'var(--chart-aptc)',
  inapt_temporar: 'var(--chart-inaptt)',
  inapt: 'var(--chart-inapt)',
}

/** Neutral single hue for non-verdict magnitude series. */
export const NEUTRAL_COLOR = 'var(--chart-neutral)'

/** Categorical colours for hazard categories (distinct from the verdict hues). */
export const CATEGORY_COLOR: Record<string, string> = {
  fizic: 'var(--chart-cat-1)',
  chimic: 'var(--chart-cat-2)',
  biologic: 'var(--chart-cat-3)',
  ergonomic: 'var(--chart-cat-4)',
  psihosocial: 'var(--chart-cat-5)',
}
export const OVERDUE_COLOR = 'var(--chart-inapt)'
export const SOON_COLOR = 'var(--chart-aptc)'
export const AXIS_COLOR = 'var(--chart-axis)'
export const GRID_COLOR = 'var(--chart-grid)'

export const CHART_HEIGHT = 260

/**
 * Injects the chart CSS variables once per chart. Duplicate <style> blocks with
 * identical :root rules are harmless; keeping it with the chart means callers
 * can't forget it.
 */
export function ChartThemeStyle() {
  return (
    <style>{`
      :root {
        --chart-apt: #059669;
        --chart-aptc: #d97706;
        --chart-inaptt: #ea580c;
        --chart-inapt: #dc2626;
        --chart-neutral: #64748b;
        --chart-axis: #64748b;
        --chart-grid: #e2e8f0;
        --chart-surface: #ffffff;
        --chart-cat-1: #2563eb;
        --chart-cat-2: #7c3aed;
        --chart-cat-3: #0d9488;
        --chart-cat-4: #db2777;
        --chart-cat-5: #4f46e5;
      }
      .dark {
        --chart-apt: #34d399;
        --chart-aptc: #fbbf24;
        --chart-inaptt: #fb923c;
        --chart-inapt: #f87171;
        --chart-neutral: #94a3b8;
        --chart-axis: #94a3b8;
        --chart-grid: #1e293b;
        --chart-surface: #0b1220;
        --chart-cat-1: #60a5fa;
        --chart-cat-2: #a78bfa;
        --chart-cat-3: #2dd4bf;
        --chart-cat-4: #f472b6;
        --chart-cat-5: #818cf8;
      }
    `}</style>
  )
}

/** Romanian-friendly tooltip box styled with the app's surface/ink tokens. */
export function ChartTooltipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: ReactNode; color?: string }> }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      <div className="font-medium text-popover-foreground mb-1">{title}</div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-popover-foreground">
            <span className="flex items-center gap-1.5">
              {r.color && <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: r.color }} aria-hidden />}
              <span className="text-muted-foreground">{r.label}</span>
            </span>
            <span className="tabular-nums font-medium">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

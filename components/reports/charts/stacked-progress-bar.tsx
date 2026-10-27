'use client'

/**
 * A 100% stacked horizontal bar (valid / expired / never). Pure CSS — one row
 * per company is cheaper than a recharts instance each. Colours come from the
 * chart CSS vars (ensure <ChartThemeStyle/> is rendered once on the page).
 */
export interface StackedSegment {
  key: string
  label: string
  value: number
  color: string
}

export function StackedProgressBar({ segments }: { segments: StackedSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
    >
      {segments.map((s) =>
        s.value > 0 ? (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ) : null
      )}
    </div>
  )
}

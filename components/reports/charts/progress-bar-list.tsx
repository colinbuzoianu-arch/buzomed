'use client'

/**
 * Compact "label + proportional bar + value" list — a non-recharts primitive
 * for ranked magnitudes where a full chart is overkill. Single neutral hue
 * (or a per-row override); the value is always shown as text, so colour is
 * never the only encoding.
 */
export interface ProgressDatum {
  label: string
  value: number
  color?: string
}

export function ProgressBarList({
  data,
  valueSuffix = '',
}: {
  data: ProgressDatum[]
  valueSuffix?: string
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1
  return (
    <div className="rounded-lg border p-3 space-y-2">
      {data.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground truncate">{d.label}</span>
            <span className="tabular-nums font-medium shrink-0">
              {d.value}
              {valueSuffix}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? 'var(--chart-neutral)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

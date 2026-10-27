'use client'

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_COLOR, ChartThemeStyle, ChartTooltipBox, NEUTRAL_COLOR } from './chart-theme'

export interface HBarDatum {
  label: string
  value: number
  /** Optional per-bar colour (e.g. by category). Falls back to neutral. */
  color?: string
}

/** Single-series magnitude ranking (e.g. top companies by exam count). Bars may
 * carry their own colour; pass `legend` to label those colours. */
export function HorizontalBarChart({
  data,
  valueLabel,
  legend,
}: {
  data: HBarDatum[]
  valueLabel: string
  legend?: Array<{ label: string; color: string }>
}) {
  const height = Math.max(200, data.length * 30 + 24)
  const truncate = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s)
  const hasColors = data.some((d) => d.color)

  return (
    <div className="rounded-lg border p-3">
      <ChartThemeStyle />
      {legend && legend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: l.color }} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: AXIS_COLOR }}
            tickFormatter={truncate}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as HBarDatum
              return <ChartTooltipBox title={d.label} rows={[{ label: valueLabel, value: d.value, color: d.color ?? NEUTRAL_COLOR }]} />
            }}
          />
          <Bar dataKey="value" fill={NEUTRAL_COLOR} radius={[0, 3, 3, 0]} maxBarSize={22}>
            {hasColors && data.map((d) => <Cell key={d.label} fill={d.color ?? NEUTRAL_COLOR} />)}
            <LabelList dataKey="value" position="right" className="fill-foreground" style={{ fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

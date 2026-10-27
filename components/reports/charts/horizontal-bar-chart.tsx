'use client'

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_COLOR, ChartThemeStyle, ChartTooltipBox, NEUTRAL_COLOR } from './chart-theme'

export interface HBarDatum {
  label: string
  value: number
}

/** Single-series magnitude ranking (e.g. top companies by exam count). */
export function HorizontalBarChart({ data, valueLabel }: { data: HBarDatum[]; valueLabel: string }) {
  const height = Math.max(200, data.length * 30 + 24)
  const truncate = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s)

  return (
    <div className="rounded-lg border p-3">
      <ChartThemeStyle />
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
              return <ChartTooltipBox title={d.label} rows={[{ label: valueLabel, value: d.value, color: NEUTRAL_COLOR }]} />
            }}
          />
          <Bar dataKey="value" fill={NEUTRAL_COLOR} radius={[0, 3, 3, 0]} maxBarSize={22}>
            <LabelList dataKey="value" position="right" className="fill-foreground" style={{ fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

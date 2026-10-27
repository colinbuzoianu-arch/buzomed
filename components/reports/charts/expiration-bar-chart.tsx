'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AXIS_COLOR,
  CHART_HEIGHT,
  ChartThemeStyle,
  ChartTooltipBox,
  GRID_COLOR,
  NEUTRAL_COLOR,
  OVERDUE_COLOR,
  SOON_COLOR,
} from './chart-theme'

export interface ExpirationDatum {
  label: string
  value: number
  tone: 'overdue' | 'soon' | 'neutral'
  href?: string
}

const TONE_COLOR: Record<ExpirationDatum['tone'], string> = {
  overdue: OVERDUE_COLOR,
  soon: SOON_COLOR,
  neutral: NEUTRAL_COLOR,
}

export function ExpirationBarChart({ data, valueLabel }: { data: ExpirationDatum[]; valueLabel: string }) {
  const router = useRouter()
  const hasLinks = data.some((d) => d.href)

  return (
    <div className="rounded-lg border p-3">
      <ChartThemeStyle />
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID_COLOR }} tick={{ fontSize: 11, fill: AXIS_COLOR }} interval={0} angle={-30} textAnchor="end" height={48} />
          <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <Tooltip
            cursor={{ fill: GRID_COLOR, opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ExpirationDatum
              return <ChartTooltipBox title={label as string} rows={[{ label: valueLabel, value: d.value, color: TONE_COLOR[d.tone] }]} />
            }}
          />
          <Bar
            dataKey="value"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
            cursor={hasLinks ? 'pointer' : undefined}
            onClick={(entry: unknown) => {
              const href = (entry as { href?: string } | undefined)?.href
              if (href) router.push(href)
            }}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={TONE_COLOR[d.tone]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

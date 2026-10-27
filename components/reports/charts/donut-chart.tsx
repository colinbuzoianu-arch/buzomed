'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartThemeStyle,
  ChartTooltipBox,
  VERDICT_COLOR,
  type VerdictKey,
} from './chart-theme'

export interface DonutDatum {
  key: VerdictKey
  label: string
  value: number
}

export function DonutChart({ data, totalLabel }: { data: DonutDatum[]; totalLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)

  return (
    <div className="rounded-lg border p-3 flex items-center gap-4">
      <ChartThemeStyle />
      <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={VERDICT_COLOR[d.key]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]
                const datum = p.payload as DonutDatum
                return (
                  <ChartTooltipBox
                    title={datum.label}
                    rows={[{ label: `${pct(datum.value)}%`, value: datum.value, color: VERDICT_COLOR[datum.key] }]}
                  />
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="space-y-1 min-w-0">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-[2px] shrink-0" style={{ background: VERDICT_COLOR[d.key] }} aria-hidden />
            <span className="text-muted-foreground truncate">{d.label}</span>
            <span className="ml-auto tabular-nums font-medium">{d.value}</span>
            <span className="tabular-nums text-xs text-muted-foreground w-9 text-right">{pct(d.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

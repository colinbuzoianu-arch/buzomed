'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AXIS_COLOR,
  CHART_HEIGHT,
  ChartThemeStyle,
  ChartTooltipBox,
  GRID_COLOR,
  VERDICT_COLOR,
  VERDICT_KEYS,
  type VerdictKey,
} from './chart-theme'

export interface VerdictRow {
  label: string
  apt: number
  apt_conditionat: number
  inapt_temporar: number
  inapt: number
}

interface TooltipEntry { name: string; value: number; color: string; dataKey: string }

function VerdictTooltip({
  active,
  label,
  payload,
  totalLabel,
}: {
  active?: boolean
  label?: string
  payload?: TooltipEntry[]
  totalLabel: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <ChartTooltipBox
      title={label ?? ''}
      rows={[
        ...payload.map((p) => ({ label: p.name, value: p.value, color: p.color })),
        { label: totalLabel, value: total },
      ]}
    />
  )
}

export function StackedBarChart({
  data,
  labels,
  totalLabel,
}: {
  data: VerdictRow[]
  labels: Record<VerdictKey, string>
  totalLabel: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <ChartThemeStyle />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
        {VERDICT_KEYS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: VERDICT_COLOR[k] }} aria-hidden />
            {labels[k]}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID_COLOR }} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <Tooltip
            cursor={{ fill: GRID_COLOR, opacity: 0.4 }}
            content={({ active, label, payload }) => (
              <VerdictTooltip active={active} label={label as string} payload={payload as unknown as TooltipEntry[]} totalLabel={totalLabel} />
            )}
          />
          {VERDICT_KEYS.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="verdict"
              name={labels[k]}
              fill={VERDICT_COLOR[k]}
              maxBarSize={48}
              radius={i === VERDICT_KEYS.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

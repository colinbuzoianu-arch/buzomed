'use client'

/**
 * Interactive chart wrappers for the HR dashboard.
 *
 * These reuse the shared cabinet chart theme (components/reports/charts/
 * chart-theme) — the same CSS-variable palette, the same tooltip box, the same
 * light/dark values — so the HR portal looks like the rest of the product. We
 * build thin wrappers here rather than reusing the cabinet chart components
 * directly for two reasons: the cabinet donut is hard-typed to the four
 * verdict keys/colours (ours needs status + "necunoscut" slices), and every
 * chart here must drive a table filter on click, which the cabinet charts
 * (built for print/report pages) don't do. Colour is never the only signal:
 * every slice/bar has a legend entry, a direct count and a Romanian tooltip.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AXIS_COLOR,
  ChartThemeStyle,
  ChartTooltipBox,
  GRID_COLOR,
} from '@/components/reports/charts/chart-theme'

export interface Slice {
  key: string
  label: string
  value: number
  color: string
}

function pctOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

/**
 * Donut with the total in the centre, a legend with counts + %, and clickable
 * slices/legend rows. `activeKey` highlights the currently-filtered slice.
 */
export function HrDonut({
  title,
  data,
  centerValue,
  centerLabel,
  onSliceClick,
  activeKey,
}: {
  title: string
  data: Slice[]
  centerValue: string | number
  centerLabel: string
  onSliceClick?: (key: string) => void
  activeKey?: string | null
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const clickable = Boolean(onSliceClick)

  return (
    <div className="rounded-lg border p-4 bg-white">
      <ChartThemeStyle />
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={total > 0 ? data : [{ key: 'empty', label: '', value: 1, color: 'var(--chart-grid)' }]}
                dataKey="value"
                nameKey="label"
                innerRadius={44}
                outerRadius={66}
                paddingAngle={total > 0 ? 2 : 0}
                strokeWidth={0}
                isAnimationActive={false}
                onClick={(entry: unknown) => {
                  const key = (entry as { key?: string } | undefined)?.key
                  if (onSliceClick && key && key !== 'empty') onSliceClick(key)
                }}
                cursor={clickable && total > 0 ? 'pointer' : undefined}
              >
                {(total > 0 ? data : [{ key: 'empty', color: 'var(--chart-grid)' }]).map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.color}
                    opacity={activeKey && activeKey !== d.key ? 0.35 : 1}
                  />
                ))}
              </Pie>
              {total > 0 && (
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as Slice
                    return (
                      <ChartTooltipBox
                        title={d.label}
                        rows={[{ label: `${pctOf(d.value, total)}%`, value: d.value, color: d.color }]}
                      />
                    )
                  }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold tabular-nums">{centerValue}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-center px-2">
              {centerLabel}
            </span>
          </div>
        </div>
        <ul className="space-y-1 min-w-0 flex-1">
          {data.map((d) => {
            const dim = activeKey && activeKey !== d.key
            const Row = clickable ? 'button' : 'div'
            return (
              <li key={d.key}>
                <Row
                  {...(clickable
                    ? { type: 'button' as const, onClick: () => onSliceClick?.(d.key) }
                    : {})}
                  className={`flex items-center gap-2 text-sm w-full text-left rounded px-1 py-0.5 ${
                    clickable ? 'hover:bg-[hsl(var(--surface-muted))]/60 cursor-pointer' : ''
                  } ${dim ? 'opacity-50' : ''}`}
                  aria-pressed={clickable ? activeKey === d.key : undefined}
                >
                  <span className="h-2.5 w-2.5 rounded-[2px] shrink-0" style={{ background: d.color }} aria-hidden />
                  <span className="text-muted-foreground truncate">{d.label}</span>
                  <span className="ml-auto tabular-nums font-medium">{d.value}</span>
                  <span className="tabular-nums text-xs text-muted-foreground w-9 text-right">
                    {pctOf(d.value, total)}%
                  </span>
                </Row>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export interface MonthBar {
  key: string
  label: string
  value: number
  color: string
}

/** Vertical bars for the next-6-months scadențe + the "deja expirați" bar. */
export function HrMonthBars({
  title,
  data,
  valueLabel,
  onBarClick,
  activeKey,
}: {
  title: string
  data: MonthBar[]
  valueLabel: string
  onBarClick?: (key: string) => void
  activeKey?: string | null
}) {
  const clickable = Boolean(onBarClick)
  return (
    <div className="rounded-lg border p-4 bg-white">
      <ChartThemeStyle />
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            tick={{ fontSize: 11, fill: AXIS_COLOR }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={48}
          />
          <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
          <Tooltip
            cursor={{ fill: GRID_COLOR, opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as MonthBar
              return <ChartTooltipBox title={label as string} rows={[{ label: valueLabel, value: d.value, color: d.color }]} />
            }}
          />
          <Bar
            dataKey="value"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
            cursor={clickable ? 'pointer' : undefined}
            onClick={(entry: unknown) => {
              const key = (entry as { key?: string } | undefined)?.key
              if (onBarClick && key) onBarClick(key)
            }}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} opacity={activeKey && activeKey !== d.key ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface WorkplaceRow {
  workplaceId: string
  label: string
  valid: number
  expiringSoon: number
  expired: number
  noExamination: number
  total: number
}

const WP_SEGMENTS: Array<{ key: keyof Omit<WorkplaceRow, 'workplaceId' | 'label' | 'total'>; colorVar: string }> = [
  { key: 'valid', colorVar: 'var(--chart-apt)' },
  { key: 'expiringSoon', colorVar: 'var(--chart-aptc)' },
  { key: 'expired', colorVar: 'var(--chart-inapt)' },
  { key: 'noExamination', colorVar: 'var(--chart-neutral)' },
]

/** Horizontal stacked bars per workplace (valid / expiring / expired / missing). */
export function HrWorkplaceBars({
  title,
  data,
  legend,
  onRowClick,
  activeId,
}: {
  title: string
  data: WorkplaceRow[]
  legend: Record<'valid' | 'expiringSoon' | 'expired' | 'noExamination', string>
  onRowClick?: (workplaceId: string) => void
  activeId?: string | null
}) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div className="rounded-lg border p-4 bg-white">
      <ChartThemeStyle />
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {WP_SEGMENTS.map((seg) => (
          <span key={seg.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: seg.colorVar }} aria-hidden />
            {legend[seg.key]}
          </span>
        ))}
      </div>
      <ul className="space-y-2">
        {data.map((d) => {
          const dim = activeId && activeId !== d.workplaceId
          return (
            <li key={d.workplaceId || '__none__'}>
              <button
                type="button"
                onClick={() => onRowClick?.(d.workplaceId)}
                className={`w-full text-left group ${dim ? 'opacity-50' : ''}`}
                aria-pressed={activeId === d.workplaceId}
              >
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="truncate font-medium">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground ml-2 shrink-0">{d.total}</span>
                </div>
                <div className="flex h-4 w-full overflow-hidden rounded-[3px] bg-[hsl(var(--surface-muted))]/60 ring-1 ring-transparent group-hover:ring-ring/40">
                  {WP_SEGMENTS.map((seg) => {
                    const v = d[seg.key]
                    if (v === 0) return null
                    return (
                      <span
                        key={seg.key}
                        className="h-full"
                        style={{ width: `${(v / max) * 100}%`, background: seg.colorVar }}
                        title={`${legend[seg.key]}: ${v}`}
                      />
                    )
                  })}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { HrExportButton } from '@/components/hr-export/HrExportButton'
import { ChartThemeStyle } from '@/components/reports/charts/chart-theme'
import {
  aggregateHrDashboard,
  matchesTableFilter,
  type AvizeKey,
  type HrDashboardResult,
  type HrEmployeeRow,
  type HrStatus,
  type HrTableFilter,
} from '@/lib/hr/dashboard-aggregate'
import { HrDonut, HrMonthBars, HrWorkplaceBars, type Slice } from './dashboard-charts'

// Shape of the messages.hrDashboard namespace, handed down from the server
// (client components can't call the server-side translator).
export interface HrDashboardLabels {
  title: string
  subtitle: string
  lastUpdated: string
  allCompanies: string
  allWorkplaces: string
  noWorkplace: string
  selectCompanyForExport: string
  activeFilter: string
  clearFilter: string
  emptyCompany: string
  emptyFiltered: string
  tableCount: string
  seeList: string
  seeAll: string
  seeLess: string
  status: Record<HrStatus, string>
  verdict: Record<AvizeKey, string>
  compliance: { title: string; center: string } & Record<HrStatus, string>
  avize: { title: string; center: string }
  programari: { title: string; center: string; programat: string; neprogramat: string }
  months: { title: string; valueLabel: string; expired: string }
  workplace: { title: string; valueLabel: string }
  alerts: {
    title: string
    expired: string
    inaptTemporar: string
    inaptTemporarEndingSoon: string
    noRecord: string
    expiring7NoSchedule: string
    none: string
  }
  table: {
    employee: string
    company: string
    jobWorkplace: string
    verdict: string
    dueDate: string
    status: string
    fisa: string
  }
}

interface Company {
  id: string
  name: string
  city: string | null
}

interface Props {
  rows: HrEmployeeRow[]
  companies: Company[]
  initialStats: HrDashboardResult
  nowMs: number
  locale: string
  labels: HrDashboardLabels
}

const STATUS_COLOR: Record<HrStatus, string> = {
  valid: 'var(--chart-apt)',
  expiringSoon: 'var(--chart-aptc)',
  expired: 'var(--chart-inapt)',
  noExamination: 'var(--chart-neutral)',
}

// apt condiționat uses the categorical blue here (per the dashboard spec),
// distinct from its orange in the cabinet verdict charts.
const AVIZE_COLOR: Record<AvizeKey, string> = {
  apt: 'var(--chart-apt)',
  apt_conditionat: 'var(--chart-cat-1)',
  inapt_temporar: 'var(--chart-aptc)',
  inapt: 'var(--chart-inapt)',
  necunoscut: 'var(--chart-neutral)',
}

const TOP_WORKPLACES = 10

function sameFilter(a: HrTableFilter, b: HrTableFilter): boolean {
  if (a.type !== b.type) return false
  if ('value' in a && 'value' in b) return a.value === b.value
  return true
}

export function HrDashboardClient({ rows, companies, initialStats, nowMs, locale, labels }: Props) {
  const [companyId, setCompanyId] = useState<string>('all')
  const [workplaceId, setWorkplaceId] = useState<string>('all')
  const [tableFilter, setTableFilter] = useState<HrTableFilter>({ type: 'none' })
  const [showAllWorkplaces, setShowAllWorkplaces] = useState(false)

  const intlLocale = locale === 'ro' ? 'ro-RO' : 'en-GB'

  const stats = useMemo(() => {
    if (companyId === 'all' && workplaceId === 'all') return initialStats
    return aggregateHrDashboard(rows, { companyId, workplaceId }, nowMs)
  }, [rows, companyId, workplaceId, nowMs, initialStats])

  // Workplace options for the header filter: distinct workplaces within the
  // currently-selected company.
  const workplaceOptions = useMemo(() => {
    const map = new Map<string, string>()
    let hasNone = false
    for (const r of rows) {
      if (companyId !== 'all' && r.companyId !== companyId) continue
      if (r.workplaceId) map.set(r.workplaceId, r.workplaceName ?? r.workplaceId)
      else hasNone = true
    }
    const list = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, intlLocale))
    if (hasNone) list.push({ id: '', name: labels.noWorkplace })
    return list
  }, [rows, companyId, intlLocale, labels.noWorkplace])

  // Clicking the already-active filter clears it (toggle).
  const toggleFilter = (next: HrTableFilter) =>
    setTableFilter((prev) => (sameFilter(prev, next) ? { type: 'none' } : next))

  const clearAll = () => {
    setTableFilter({ type: 'none' })
  }

  const tableRows = useMemo(
    () => stats.rows.filter((r) => matchesTableFilter(r, tableFilter, nowMs)),
    [stats.rows, tableFilter, nowMs]
  )

  const exportCompanyId =
    companyId !== 'all' ? companyId : companies.length === 1 ? companies[0].id : null

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—'

  const monthLabel = (key: string, year: number, month: number) => {
    if (key === 'expired') return labels.months.expired
    const name = new Date(Date.UTC(year, month, 1)).toLocaleDateString(intlLocale, { month: 'short' })
    return month === 0 ? `${name} ${year}` : name
  }

  // ---- Donut datasets -------------------------------------------------------
  const complianceData: Slice[] = stats.compliance.map((s) => ({
    key: s.key,
    label: labels.compliance[s.key],
    value: s.value,
    color: STATUS_COLOR[s.key],
  }))

  const avizeData: Slice[] = stats.avize
    .filter((s) => s.value > 0 || s.key !== 'necunoscut')
    .map((s) => ({ key: s.key, label: labels.verdict[s.key], value: s.value, color: AVIZE_COLOR[s.key] }))
  const avizeTotal = stats.avize.reduce((sum, s) => sum + s.value, 0)

  const programariData: Slice[] = stats.programari.slices.map((s) => ({
    key: s.key,
    label: labels.programari[s.key],
    value: s.value,
    color: s.key === 'programat' ? 'var(--chart-apt)' : 'var(--chart-aptc)',
  }))

  const monthData = stats.byMonth.map((b) => ({
    key: b.key,
    label: monthLabel(b.key, b.year, b.month),
    value: b.value,
    color: b.tone === 'overdue' ? 'var(--chart-inapt)' : 'var(--chart-neutral)',
  }))

  const workplaceRows = (showAllWorkplaces ? stats.byWorkplace : stats.byWorkplace.slice(0, TOP_WORKPLACES)).map(
    (w) => ({
      workplaceId: w.workplaceId,
      label: w.workplaceName || labels.noWorkplace,
      valid: w.valid,
      expiringSoon: w.expiringSoon,
      expired: w.expired,
      noExamination: w.noExamination,
      total: w.total,
    })
  )

  const activeOf = (type: HrTableFilter['type']): string | null =>
    tableFilter.type === type && 'value' in tableFilter ? String(tableFilter.value) : null

  const hasEmployees = rows.length > 0
  const scopedTotal = stats.summary.total

  const activeFilterLabel = describeFilter(tableFilter, labels, monthData)

  return (
    <div className="space-y-6">
      <ChartThemeStyle />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{labels.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{labels.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {exportCompanyId ? (
            <HrExportButton companyId={exportCompanyId} apiBase="hr-portal" />
          ) : (
            <p className="text-xs text-muted-foreground">{labels.selectCompanyForExport}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {labels.lastUpdated}:{' '}
            {new Date(nowMs).toLocaleString(intlLocale, { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {companies.length > 1 && (
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value)
              setWorkplaceId('all')
              clearAll()
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{labels.allCompanies}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {workplaceOptions.length > 1 && (
          <select
            value={workplaceId}
            onChange={(e) => {
              setWorkplaceId(e.target.value)
              clearAll()
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">{labels.allWorkplaces}</option>
            {workplaceOptions.map((w) => (
              <option key={w.id || '__none__'} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!hasEmployees ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <p>{labels.emptyCompany}</p>
        </div>
      ) : (
        <>
          {/* Row 1: three donuts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HrDonut
              title={labels.compliance.title}
              data={complianceData}
              centerValue={`${stats.summary.conformPct}%`}
              centerLabel={labels.compliance.center}
              onSliceClick={(key) => toggleFilter({ type: 'status', value: key as HrStatus })}
              activeKey={activeOf('status')}
            />
            <HrDonut
              title={labels.avize.title}
              data={avizeData}
              centerValue={avizeTotal}
              centerLabel={labels.avize.center}
              onSliceClick={(key) => toggleFilter({ type: 'avize', value: key as AvizeKey })}
              activeKey={activeOf('avize')}
            />
            <HrDonut
              title={labels.programari.title}
              data={programariData}
              centerValue={stats.programari.total}
              centerLabel={labels.programari.center}
              onSliceClick={(key) =>
                toggleFilter({ type: 'programare', value: key as 'programat' | 'neprogramat' })
              }
              activeKey={activeOf('programare')}
            />
          </div>

          {/* Row 2: month bars + workplace bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HrMonthBars
              title={labels.months.title}
              data={monthData}
              valueLabel={labels.months.valueLabel}
              onBarClick={(key) => toggleFilter({ type: 'month', value: key })}
              activeKey={activeOf('month')}
            />
            <div className="space-y-2">
              <HrWorkplaceBars
                title={labels.workplace.title}
                data={workplaceRows}
                legend={{
                  valid: labels.compliance.valid,
                  expiringSoon: labels.compliance.expiringSoon,
                  expired: labels.compliance.expired,
                  noExamination: labels.compliance.noExamination,
                }}
                onRowClick={(id) => toggleFilter({ type: 'workplace', value: id })}
                activeId={activeOf('workplace')}
              />
              {stats.byWorkplace.length > TOP_WORKPLACES && (
                <button
                  type="button"
                  onClick={() => setShowAllWorkplaces((v) => !v)}
                  className="text-xs text-primary hover:underline px-1"
                >
                  {showAllWorkplaces ? labels.seeLess : labels.seeAll}
                </button>
              )}
            </div>
          </div>

          {/* Row 3: alerts */}
          <AlertsPanel labels={labels} alerts={stats.alerts} activeFilter={tableFilter} onFilter={toggleFilter} />

          {/* Active filter chip */}
          {tableFilter.type !== 'none' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border bg-primary/5 border-primary/40 px-3 py-1">
                <span className="text-muted-foreground">{labels.activeFilter}:</span>
                <span className="font-medium">{activeFilterLabel}</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={labels.clearFilter}
                >
                  ✕
                </button>
              </span>
              <button type="button" onClick={clearAll} className="text-muted-foreground hover:text-foreground">
                {labels.clearFilter}
              </button>
            </div>
          )}

          {/* Row 4: table */}
          {tableRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <p>{labels.emptyFiltered}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--surface-muted))]/60 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.employee}</th>
                      {companies.length > 1 && (
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.company}</th>
                      )}
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.jobWorkplace}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.verdict}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.dueDate}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.status}</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">{labels.table.fisa}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tableRows.map((row) => (
                      <tr key={row.id} className="bg-white hover:bg-[hsl(var(--surface-muted))]/30 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          {row.lastName} {row.firstName}
                        </td>
                        {companies.length > 1 && (
                          <td className="px-4 py-3 text-muted-foreground">
                            {companies.find((c) => c.id === row.companyId)?.name ?? '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-muted-foreground">
                          <div>{row.jobTitle || '—'}</div>
                          {row.workplaceName && (
                            <div className="text-xs text-muted-foreground/70">{row.workplaceName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{verdictLabel(row, labels)}</td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtDate(row.dueDate)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} label={labels.status[row.status]} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/hr-portal/fise?q=${encodeURIComponent(`${row.lastName} ${row.firstName}`)}`}
                            className="text-primary hover:underline text-sm"
                          >
                            {labels.table.fisa}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-[hsl(var(--surface-muted))]/30">
                {labels.tableCount
                  .replace('{shown}', String(tableRows.length))
                  .replace('{total}', String(scopedTotal))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function verdictLabel(row: HrEmployeeRow, labels: HrDashboardLabels) {
  if (row.verdictKnown && row.verdict) return labels.verdict[row.verdict]
  if (row.source === 'recall') return <span className="text-muted-foreground">{labels.verdict.necunoscut}</span>
  return <span className="text-muted-foreground">—</span>
}

const STATUS_BADGE: Record<HrStatus, string> = {
  valid: 'bg-green-50 text-green-700',
  expiringSoon: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-700',
  noExamination: 'bg-slate-100 text-slate-600',
}
const STATUS_DOT: Record<HrStatus, string> = {
  valid: 'bg-green-500',
  expiringSoon: 'bg-amber-500',
  expired: 'bg-red-500',
  noExamination: 'bg-slate-400',
}

function StatusBadge({ status, label }: { status: HrStatus; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {label}
    </span>
  )
}

function AlertsPanel({
  labels,
  alerts,
  activeFilter,
  onFilter,
}: {
  labels: HrDashboardLabels
  alerts: HrDashboardResult['alerts']
  activeFilter: HrTableFilter
  onFilter: (f: HrTableFilter) => void
}) {
  const items: Array<{
    key: string
    show: boolean
    border: string
    label: string
    count: number
    filter: HrTableFilter
    extra?: React.ReactNode
  }> = [
    {
      key: 'expired',
      show: alerts.expired > 0,
      border: 'border-l-red-500',
      label: labels.alerts.expired,
      count: alerts.expired,
      filter: { type: 'status', value: 'expired' },
    },
    {
      key: 'inaptTemporar',
      show: alerts.inaptTemporar > 0,
      border: 'border-l-amber-500',
      label: labels.alerts.inaptTemporar,
      count: alerts.inaptTemporar,
      filter: { type: 'inaptTemporar' },
      extra:
        alerts.inaptTemporarEndingSoon > 0 ? (
          <button
            type="button"
            onClick={() => onFilter({ type: 'inaptTemporarEndingSoon' })}
            className="text-xs text-amber-700 hover:underline"
          >
            {labels.alerts.inaptTemporarEndingSoon.replace('{count}', String(alerts.inaptTemporarEndingSoon))}
          </button>
        ) : null,
    },
    {
      key: 'noRecord',
      show: alerts.noRecord > 0,
      border: 'border-l-slate-400',
      label: labels.alerts.noRecord,
      count: alerts.noRecord,
      filter: { type: 'noRecord' },
    },
    {
      key: 'expiring7NoSchedule',
      show: alerts.expiring7NoSchedule > 0,
      border: 'border-l-orange-500',
      label: labels.alerts.expiring7NoSchedule,
      count: alerts.expiring7NoSchedule,
      filter: { type: 'expiring7NoSchedule' },
    },
  ]

  const visible = items.filter((i) => i.show)

  return (
    <div className="rounded-lg border p-4 bg-white">
      <h3 className="text-sm font-semibold mb-3">{labels.alerts.title}</h3>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.alerts.none}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const active = sameFilter(activeFilter, item.filter)
            return (
              <li
                key={item.key}
                className={`border-l-4 ${item.border} pl-3 py-1.5 rounded-r bg-[hsl(var(--surface-muted))]/30 ${
                  active ? 'ring-1 ring-primary/40' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="tabular-nums font-semibold">{item.count}</span>
                    <span className="text-sm truncate">{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onFilter(item.filter)}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    {labels.seeList}
                  </button>
                </div>
                {item.extra && <div className="mt-0.5">{item.extra}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function describeFilter(
  filter: HrTableFilter,
  labels: HrDashboardLabels,
  monthData: Array<{ key: string; label: string }>
): string {
  switch (filter.type) {
    case 'status':
      return labels.status[filter.value]
    case 'avize':
      return labels.verdict[filter.value]
    case 'programare':
      return labels.programari[filter.value]
    case 'month':
      return monthData.find((m) => m.key === filter.value)?.label ?? labels.months.title
    case 'workplace':
      return labels.workplace.title
    case 'expiring7NoSchedule':
      return labels.alerts.expiring7NoSchedule
    case 'inaptTemporar':
      return labels.alerts.inaptTemporar
    case 'inaptTemporarEndingSoon':
      return labels.alerts.inaptTemporarEndingSoon.replace('{count}', '')
    case 'noRecord':
      return labels.alerts.noRecord
    default:
      return ''
  }
}

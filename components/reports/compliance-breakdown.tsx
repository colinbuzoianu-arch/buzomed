'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CompanyComplianceSummary } from '@/lib/reports/compliance-data'
import { ChartCard } from './chart-card'
import { NEUTRAL_COLOR, VERDICT_COLOR } from './charts/chart-theme'
import { StackedProgressBar } from './charts/stacked-progress-bar'

interface Labels {
  title: string
  company: string
  employees: string
  coverage: string
  valid: string
  expired: string
  never: string
  sortLabel: string
  sortCoverage: string
  sortName: string
  sortEmployees: string
  chart: string
  table: string
  exportCsv: string
}

type SortKey = 'coverage' | 'name' | 'employees'

export function ComplianceBreakdown({
  companies,
  year,
  labels,
}: {
  companies: CompanyComplianceSummary[]
  year: number
  labels: Labels
}) {
  const [sort, setSort] = useState<SortKey>('coverage')

  const sorted = [...companies].sort((a, b) => {
    if (sort === 'name') return a.companyName.localeCompare(b.companyName, 'ro')
    if (sort === 'employees') return b.total - a.total
    // coverage: lowest first; null (no employees) last
    const ca = a.coverageRate ?? Number.POSITIVE_INFINITY
    const cb = b.coverageRate ?? Number.POSITIVE_INFINITY
    return ca - cb || a.companyName.localeCompare(b.companyName, 'ro')
  })

  const segmentsFor = (c: CompanyComplianceSummary) => [
    { key: 'valid', label: labels.valid, value: c.valid, color: VERDICT_COLOR.apt },
    { key: 'expired', label: labels.expired, value: c.expired, color: VERDICT_COLOR.inapt },
    { key: 'never', label: labels.never, value: c.neverExamined, color: NEUTRAL_COLOR },
  ]

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      aria-pressed={sort === key}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        sort === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )

  const csv = {
    headers: [labels.company, labels.employees, labels.coverage, labels.valid, labels.expired, labels.never],
    rows: sorted.map((c) => [
      c.companyName,
      c.total,
      c.coverageRate == null ? '' : `${c.coverageRate}%`,
      c.valid,
      c.expired,
      c.neverExamined,
    ] as Array<string | number>),
  }

  const chart = (
    <div className="rounded-lg border divide-y">
      {sorted.map((c) => (
        <Link
          key={c.companyId}
          href={`/companies/${c.companyId}/compliance?year=${year}`}
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
        >
          <span className="w-40 shrink-0 truncate text-sm font-medium" title={c.companyName}>
            {c.companyName}
          </span>
          <span className="flex-1 min-w-0">
            <StackedProgressBar segments={segmentsFor(c)} />
          </span>
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
            {c.coverageRate == null ? '—' : `${c.coverageRate}%`}
          </span>
          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{c.total}</span>
        </Link>
      ))}
    </div>
  )

  const table = (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2">{labels.company}</th>
            <th className="text-right px-4 py-2">{labels.employees}</th>
            <th className="text-right px-4 py-2">{labels.coverage}</th>
            <th className="text-right px-4 py-2">{labels.valid}</th>
            <th className="text-right px-4 py-2">{labels.expired}</th>
            <th className="text-right px-4 py-2">{labels.never}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((c) => (
            <tr key={c.companyId} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2">
                <Link href={`/companies/${c.companyId}/compliance?year=${year}`} className="font-medium hover:underline">
                  {c.companyName}
                </Link>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{c.total}</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold">
                {c.coverageRate == null ? '—' : `${c.coverageRate}%`}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{c.valid}</td>
              <td className="px-4 py-2 text-right tabular-nums text-red-700">{c.expired}</td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{c.neverExamined}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{labels.sortLabel}:</span>
        <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
          {sortBtn('coverage', labels.sortCoverage)}
          {sortBtn('name', labels.sortName)}
          {sortBtn('employees', labels.sortEmployees)}
        </div>
      </div>
      <ChartCard
        title={labels.title}
        labels={{ chart: labels.chart, table: labels.table, exportCsv: labels.exportCsv }}
        csv={csv}
        filename={`buzomed-conformitate-${year}`}
        chart={chart}
        table={table}
      />
    </div>
  )
}

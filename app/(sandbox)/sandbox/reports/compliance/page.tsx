'use client'

import { useMemo } from 'react'
import { NEUTRAL_COLOR, VERDICT_COLOR } from '@/components/reports/charts/chart-theme'
import { StackedProgressBar } from '@/components/reports/charts/stacked-progress-bar'
import { companyCompliance } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from '../_report-chart'

export default function SandboxComplianceReportPage() {
  const { data } = useSandboxStore()
  const rows = useMemo(() => companyCompliance(data), [data])

  const chart = (
    <div className="space-y-4">
      {rows.map((c) => (
        <div key={c.companyId} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium truncate">{c.companyName}</span>
            <span className="tabular-nums text-muted-foreground">
              {c.coverage == null ? '—' : `${c.coverage}%`} · {c.total} angajați
            </span>
          </div>
          <StackedProgressBar
            segments={[
              { key: 'valid', label: 'Fișă validă', value: c.valid, color: VERDICT_COLOR.apt },
              { key: 'expired', label: 'Expirată', value: c.expired, color: VERDICT_COLOR.inapt },
              { key: 'never', label: 'Niciodată', value: c.never, color: NEUTRAL_COLOR },
            ]}
          />
        </div>
      ))}
    </div>
  )

  return (
    <ReportChart
      title="Conformitate pe companie"
      filename="conformitate-companii"
      chart={chart}
      csv={{
        headers: ['Companie', 'Angajați', 'Acoperire', 'Fișă validă', 'Expirată', 'Niciodată'],
        rows: rows.map((c) => [
          c.companyName,
          c.total,
          c.coverage == null ? '' : `${c.coverage}%`,
          c.valid,
          c.expired,
          c.never,
        ]),
      }}
    />
  )
}

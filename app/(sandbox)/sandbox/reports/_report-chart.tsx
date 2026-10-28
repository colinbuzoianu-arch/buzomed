'use client'

import type { ReactNode } from 'react'
import { ChartCard, type CsvData } from '@/components/reports/chart-card'

function SimpleTable({ headers, rows }: CsvData) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))] ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-b last:border-0">
              {r.map((cell, i) => (
                <td
                  key={`${r[0]}-${headers[i]}`}
                  className={`px-4 py-2 ${i === 0 ? 'text-left font-medium' : 'text-right tabular-nums text-muted-foreground'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** ChartCard wrapper that derives the table view from the CSV rows. */
export function ReportChart({
  title,
  filename,
  chart,
  csv,
  defaultView,
}: {
  title: string
  filename: string
  chart: ReactNode
  csv: CsvData
  defaultView?: 'chart' | 'table'
}) {
  return (
    <ChartCard
      title={title}
      chart={chart}
      table={<SimpleTable headers={csv.headers} rows={csv.rows} />}
      csv={csv}
      filename={filename}
      defaultView={defaultView}
      labels={{ chart: 'Grafic', table: 'Tabel', exportCsv: 'Export CSV' }}
    />
  )
}

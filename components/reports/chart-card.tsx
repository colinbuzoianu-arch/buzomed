'use client'

import { BarChart3, Download, Table2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

/**
 * Wraps a chart + its (existing) table in one card with a "Grafic / Tabel"
 * toggle and a CSV export of exactly the rows shown. The table markup is passed
 * through untouched from the server page. CSV is built client-side from the
 * same rows, UTF-8 with a BOM so Excel renders diacritics.
 */

export interface CsvData {
  headers: string[]
  rows: Array<Array<string | number>>
}

interface Labels {
  chart: string
  table: string
  exportCsv: string
}

function buildCsv({ headers, rows }: CsvData): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  return `﻿${lines.join('\r\n')}`
}

export function ChartCard({
  title,
  chart,
  table,
  csv,
  filename,
  labels,
  defaultView = 'chart',
}: {
  title: string
  chart: ReactNode
  table: ReactNode
  csv: CsvData
  filename: string
  labels: Labels
  defaultView?: 'chart' | 'table'
}) {
  const [view, setView] = useState<'chart' | 'table'>(defaultView)

  function exportCsv() {
    const blob = new Blob([buildCsv(csv)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const btn = (v: 'chart' | 'table', label: string, Icon: typeof BarChart3) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
            {btn('chart', labels.chart, BarChart3)}
            {btn('table', labels.table, Table2)}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-[hsl(var(--surface-muted))] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {labels.exportCsv}
          </button>
        </div>
      </div>
      {view === 'chart' ? chart : table}
    </div>
  )
}

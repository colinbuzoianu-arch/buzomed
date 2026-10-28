'use client'

import { useMemo } from 'react'
import { HorizontalBarChart } from '@/components/reports/charts/horizontal-bar-chart'
import { examsByType } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from '../_report-chart'

export default function SandboxPractitionersReportPage() {
  const { data } = useSandboxStore()
  const byType = useMemo(() => examsByType(data), [data])
  const total = byType.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.practitioner.displayName} · {total} examinări finalizate
      </p>
      <ReportChart
        title="Examinări pe tip (per practician)"
        filename="examinari-per-practician"
        chart={<HorizontalBarChart data={byType} valueLabel="Examinări" />}
        csv={{
          headers: ['Tip examinare', 'Examinări'],
          rows: byType.map((d) => [d.label, d.value]),
        }}
      />
    </div>
  )
}

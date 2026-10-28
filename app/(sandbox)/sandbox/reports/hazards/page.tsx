'use client'

import { useMemo } from 'react'
import { HorizontalBarChart } from '@/components/reports/charts/horizontal-bar-chart'
import { hazardExposure } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from '../_report-chart'

export default function SandboxHazardsReportPage() {
  const { data } = useSandboxStore()
  const hazards = useMemo(() => hazardExposure(data), [data])

  return (
    <ReportChart
      title="Expuneri la noxe (angajați expuși)"
      filename="expuneri-noxe"
      chart={<HorizontalBarChart data={hazards} valueLabel="Angajați" />}
      csv={{
        headers: ['Noxă', 'Angajați expuși'],
        rows: hazards.map((h) => [h.label, h.value]),
      }}
    />
  )
}

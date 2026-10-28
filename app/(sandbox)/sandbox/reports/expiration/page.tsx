'use client'

import { useMemo } from 'react'
import { ExpirationBarChart } from '@/components/reports/charts/expiration-bar-chart'
import { expirationBuckets } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from '../_report-chart'

export default function SandboxExpirationReportPage() {
  const { data } = useSandboxStore()
  const buckets = useMemo(() => expirationBuckets(data), [data])

  return (
    <ReportChart
      title="Scadențe pe intervale"
      filename="scadente-intervale"
      chart={<ExpirationBarChart data={buckets} valueLabel="Controale" />}
      csv={{
        headers: ['Interval', 'Controale'],
        rows: buckets.map((b) => [b.label, b.value]),
      }}
    />
  )
}

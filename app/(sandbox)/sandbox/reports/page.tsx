'use client'

import { useMemo } from 'react'
import { DonutChart } from '@/components/reports/charts/donut-chart'
import { StackedBarChart } from '@/components/reports/charts/stacked-bar-chart'
import { monthlyVerdicts, verdictDonut } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from './_report-chart'

export default function SandboxReportsOverviewPage() {
  const { data } = useSandboxStore()
  const donut = useMemo(() => verdictDonut(data), [data])
  const monthly = useMemo(() => monthlyVerdicts(data), [data])

  const total = donut.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-8">
      <ReportChart
        title="Examinări pe lună (ultimele 12 luni)"
        filename="examinari-lunare"
        chart={
          <StackedBarChart
            data={monthly}
            totalLabel="Total"
            labels={{
              apt: 'Apt',
              apt_conditionat: 'Apt condiționat',
              inapt_temporar: 'Inapt temporar',
              inapt: 'Inapt',
            }}
          />
        }
        csv={{
          headers: ['Lună', 'Apt', 'Apt condiționat', 'Inapt temporar', 'Inapt'],
          rows: monthly.map((m) => [m.label, m.apt, m.apt_conditionat, m.inapt_temporar, m.inapt]),
        }}
      />

      <ReportChart
        title="Distribuția avizelor"
        filename="distributie-avize"
        chart={<DonutChart data={donut} totalLabel={`${total} avize`} />}
        csv={{
          headers: ['Verdict', 'Număr'],
          rows: donut.map((d) => [d.label, d.value]),
        }}
      />
    </div>
  )
}

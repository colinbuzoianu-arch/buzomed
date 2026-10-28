'use client'

import { useMemo } from 'react'
import { ProgressBarList } from '@/components/reports/charts/progress-bar-list'
import { vaccinationCoverage } from '@/lib/sandbox/reports'
import { useSandboxStore } from '@/lib/sandbox/store'
import { ReportChart } from '../_report-chart'

export default function SandboxVaccinationsReportPage() {
  const { data } = useSandboxStore()
  const vaccines = useMemo(() => vaccinationCoverage(data), [data])

  return (
    <ReportChart
      title="Acoperire vaccinală (angajați vaccinați)"
      filename="acoperire-vaccinala"
      chart={<ProgressBarList data={vaccines} valueSuffix=" angajați" />}
      csv={{
        headers: ['Vaccin', 'Angajați vaccinați'],
        rows: vaccines.map((v) => [v.label, v.value]),
      }}
    />
  )
}

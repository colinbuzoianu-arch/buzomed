'use client'

import { Download, FileText } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterChip } from './filter-chip'

export interface AvizeFilterLabels {
  period: string
  periods: Record<string, string>
  company: string
  verdict: string
  verdicts: Record<string, string>
  from: string
  to: string
  includeRevoked: string
  exportCsv: string
  downloadAll: string
  downloadAllHint: string
}

interface Props {
  companies: Array<{ id: string; name: string }>
  labels: AvizeFilterLabels
  values: {
    period?: string
    from?: string
    to?: string
    companyId?: string
    verdict?: string
    includeRevoked: boolean
  }
  exportHref: string
  pdfHref: string
  pdfReady: boolean
}

export function AvizeFilterBar({ companies, labels, values, exportHref, pdfHref, pdfReady }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}`)
  }

  const periodOptions = ['azi', '7zile', 'luna', 'luna_trecuta', 'an', 'custom']
  const verdictOptions = ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt']

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label={labels.period}
        value={values.period}
        onClear={() => setParams({ period: null, from: null, to: null })}
      >
        <select
          value={values.period ?? ''}
          onChange={(e) => setParams({ period: e.target.value || null })}
          className="chip-select"
          aria-label={labels.period}
        >
          <option value="">{labels.period}</option>
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {labels.periods[p]}
            </option>
          ))}
        </select>
      </FilterChip>

      {values.period === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={values.from ?? ''}
            onChange={(e) => setParams({ from: e.target.value || null })}
            aria-label={labels.from}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <input
            type="date"
            value={values.to ?? ''}
            onChange={(e) => setParams({ to: e.target.value || null })}
            aria-label={labels.to}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
      )}

      <FilterChip
        label={labels.company}
        value={values.companyId}
        onClear={() => setParams({ companyId: null })}
      >
        <select
          value={values.companyId ?? ''}
          onChange={(e) => setParams({ companyId: e.target.value || null })}
          className="chip-select"
          aria-label={labels.company}
        >
          <option value="">{labels.company}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterChip>

      <FilterChip
        label={labels.verdict}
        value={values.verdict}
        onClear={() => setParams({ verdict: null })}
      >
        <select
          value={values.verdict ?? ''}
          onChange={(e) => setParams({ verdict: e.target.value || null })}
          className="chip-select"
          aria-label={labels.verdict}
        >
          <option value="">{labels.verdict}</option>
          {verdictOptions.map((v) => (
            <option key={v} value={v}>
              {labels.verdicts[v]}
            </option>
          ))}
        </select>
      </FilterChip>

      <label className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted">
        <input
          type="checkbox"
          checked={values.includeRevoked}
          onChange={(e) => setParams({ retrase: e.target.checked ? null : '0' })}
          className="h-3.5 w-3.5"
        />
        {labels.includeRevoked}
      </label>

      <div className="ml-auto flex items-center gap-2">
        {pdfReady ? (
          <a
            href={pdfHref}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" />
            {labels.downloadAll}
          </a>
        ) : (
          <button
            type="button"
            disabled
            title={labels.downloadAllHint}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground opacity-60 cursor-not-allowed"
          >
            <FileText className="h-3.5 w-3.5" />
            {labels.downloadAll}
          </button>
        )}
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          {labels.exportCsv}
        </a>
      </div>
    </div>
  )
}

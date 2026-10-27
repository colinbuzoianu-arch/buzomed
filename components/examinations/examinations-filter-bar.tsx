'use client'

import { Download, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FilterChip } from './filter-chip'

export interface FilterBarOptions {
  types: Array<{ id: string; name: string }>
  companies: Array<{ id: string; name: string }>
  practitioners: Array<{ id: string; label: string }>
}

export interface FilterBarLabels {
  searchPlaceholder: string
  exportCsv: string
  clearAll: string
  period: string
  periods: Record<string, string> // azi/7zile/luna/luna_trecuta/an/custom
  type: string
  verdict: string
  verdicts: Record<string, string> // apt/apt_conditionat/inapt_temporar/inapt/none
  company: string
  practitioner: string
  sign: string
  signs: Record<string, string> // semnate/nesemnate/retrase
  from: string
  to: string
}

interface Props {
  options: FilterBarOptions
  labels: FilterBarLabels
  values: {
    period?: string
    from?: string
    to?: string
    type?: string
    verdict?: string
    companyId?: string
    practitionerId?: string
    sign?: string
    search?: string
  }
  exportHref: string
}

export function ExaminationsFilterBar({ options, labels, values, exportHref }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(values.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.delete('page') // any filter change returns to page 1
    router.replace(`${pathname}?${params.toString()}`)
  }

  // Debounced text search — intentionally keyed on `search` only; pushing the
  // other deps would re-fire the debounce on every URL change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce on `search` alone
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if ((values.search ?? '') !== search.trim()) {
        setParams({ search: search.trim() || null })
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const anyActive = Boolean(
    values.period ||
      values.type ||
      values.verdict ||
      values.companyId ||
      values.practitionerId ||
      values.sign ||
      values.search
  )

  function clearAll() {
    setSearch('')
    setParams({
      period: null,
      from: null,
      to: null,
      type: null,
      verdict: null,
      companyId: null,
      practitionerId: null,
      sign: null,
      search: null,
    })
  }

  const periodOptions = ['azi', '7zile', 'luna', 'luna_trecuta', 'an', 'custom']
  const verdictOptions = ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt', 'none']
  const signOptions = ['semnate', 'nesemnate', 'retrase']

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-9 min-w-[200px] flex-1 max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/40"
          aria-label={labels.searchPlaceholder}
        />

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

        <FilterChip label={labels.type} value={values.type} onClear={() => setParams({ type: null })}>
          <select
            value={values.type ?? ''}
            onChange={(e) => setParams({ type: e.target.value || null })}
            className="chip-select"
            aria-label={labels.type}
          >
            <option value="">{labels.type}</option>
            {options.types.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
            {options.companies.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip
          label={labels.practitioner}
          value={values.practitionerId}
          onClear={() => setParams({ practitionerId: null })}
        >
          <select
            value={values.practitionerId ?? ''}
            onChange={(e) => setParams({ practitionerId: e.target.value || null })}
            className="chip-select"
            aria-label={labels.practitioner}
          >
            <option value="">{labels.practitioner}</option>
            {options.practitioners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label={labels.sign} value={values.sign} onClear={() => setParams({ sign: null })}>
          <select
            value={values.sign ?? ''}
            onChange={(e) => setParams({ sign: e.target.value || null })}
            className="chip-select"
            aria-label={labels.sign}
          >
            <option value="">{labels.sign}</option>
            {signOptions.map((s) => (
              <option key={s} value={s}>
                {labels.signs[s]}
              </option>
            ))}
          </select>
        </FilterChip>

        {anyActive && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            {labels.clearAll}
          </button>
        )}

        <a
          href={exportHref}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          {labels.exportCsv}
        </a>
      </div>
    </div>
  )
}

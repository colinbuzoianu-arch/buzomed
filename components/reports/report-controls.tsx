'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Option {
  value: string
  label: string
}

interface Props {
  /** localStorage key, per page. */
  storageKey: string
  /** The page's existing primary selector (range for overview, horizon for expiration). */
  primaryParam: string
  primaryOptions: Option[]
  primaryValue: string
  /** Company filter ({value:id,label:name}); first option is "all" with value ''. */
  companies: Option[]
  companyParam: string
  companyValue: string
  allCompaniesLabel: string
  /** Group-by selector. */
  groupParam: string
  groupOptions: Option[]
  groupValue: string
  groupByLabel: string
  /** Optional trailing content (e.g. a full-export link). */
  trailing?: ReactNode
}

const SELECT_CLS =
  'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors max-w-[220px]'

export function ReportControls({
  storageKey,
  primaryParam,
  primaryOptions,
  primaryValue,
  companies,
  companyParam,
  companyValue,
  allCompaniesLabel,
  groupParam,
  groupOptions,
  groupValue,
  groupByLabel,
  trailing,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Remember the last choice per page, but only APPLY it when the URL carries
  // no params of its own (fresh navigation). Wrapped in try/catch — storage can
  // throw in private mode.
  useEffect(() => {
    try {
      const current = searchParams.toString()
      if (current === '') {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          router.replace(`${pathname}?${stored}`)
          return
        }
      } else {
        localStorage.setItem(storageKey, current)
      }
    } catch {
      // ignore storage failures
    }
  }, [searchParams, pathname, router, storageKey])

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    const qs = p.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {primaryOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setParam(primaryParam, o.value)}
            className={`px-3 py-1 rounded-md border transition-colors ${
              primaryValue === o.value ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {companies.length > 0 && (
        <select
          aria-label={allCompaniesLabel}
          value={companyValue}
          onChange={(e) => setParam(companyParam, e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">{allCompaniesLabel}</option>
          {companies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}

      {groupOptions.length > 0 && (
        <select
          aria-label={groupByLabel}
          value={groupValue}
          onChange={(e) => setParam(groupParam, e.target.value)}
          className={SELECT_CLS}
        >
          {groupOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {groupByLabel}: {o.label}
            </option>
          ))}
        </select>
      )}

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}

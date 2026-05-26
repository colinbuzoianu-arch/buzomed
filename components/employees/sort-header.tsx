'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface Props {
  label: string
  sortAsc: string
  sortDesc: string
  currentSort: string
  className?: string
}

export function SortHeader({ label, sortAsc, sortDesc, currentSort, className = '' }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isAsc = currentSort === sortAsc
  const isDesc = currentSort === sortDesc
  const isActive = isAsc || isDesc

  const nextSort = isAsc ? sortDesc : sortAsc

  function buildUrl(s: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', s)
    return `${pathname}?${params.toString()}`
  }

  return (
    <Link
      href={buildUrl(nextSort)}
      className={`group inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        isActive ? 'text-foreground' : 'text-[hsl(var(--text-muted))]'
      } ${className}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="flex flex-col gap-[1px] opacity-60 group-hover:opacity-100">
        <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor" className={isAsc ? 'opacity-100' : 'opacity-30'}>
          <path d="M3 0L6 4H0L3 0Z" />
        </svg>
        <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor" className={isDesc ? 'opacity-100' : 'opacity-30'}>
          <path d="M3 4L0 0H6L3 4Z" />
        </svg>
      </span>
    </Link>
  )
}

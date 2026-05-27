'use client'

import { useState, useEffect, useRef } from 'react'

export type EmployeeResult = {
  id: string
  firstName: string
  lastName: string
  jobTitle: string | null
  companyName: string
}

interface Props {
  onSelect: (employee: EmployeeResult) => void
  placeholder?: string
}

export function EmployeeSearchCombobox({ onSelect, placeholder = 'Caută angajat...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EmployeeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.employees ?? [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handleSelect(emp: EmployeeResult) {
    setQuery(`${emp.lastName} ${emp.firstName}`)
    setOpen(false)
    onSelect(emp)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        placeholder={placeholder}
        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
        autoFocus
      />
      {loading && (
        <div className="absolute right-3 top-2.5">
          <svg className="animate-spin h-4 w-4 text-[hsl(var(--text-faint))]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-card shadow-lg overflow-hidden">
          {results.map(emp => (
            <button
              key={emp.id}
              type="button"
              onClick={() => handleSelect(emp)}
              className="w-full text-left px-3 py-2.5 hover:bg-[hsl(var(--surface-tinted))] transition-colors border-b last:border-b-0"
            >
              <div className="text-sm font-medium">{emp.lastName} {emp.firstName}</div>
              <div className="text-[11px] text-[hsl(var(--text-muted))]">
                {emp.companyName}
                {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-card shadow-md px-3 py-3 text-sm text-[hsl(var(--text-muted))]">
          Niciun angajat găsit.
        </div>
      )}
    </div>
  )
}

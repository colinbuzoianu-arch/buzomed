'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChevronDownIcon, LoaderCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmployeeSearchResult {
  id: string
  firstName: string
  lastName: string
  jobTitle: string | null
  companyName: string
  workplaceName: string
  workplaceId: string | null
  workplaceDepartment: string | null
  companyEmployeeId: string | null
}

interface Props {
  value: string
  onChange: (id: string) => void
  /** Called with the full employee object whenever selection changes, including on preselect resolution. */
  onEmployeeChange?: (employee: EmployeeSearchResult | null) => void
  placeholder: string
  searchPlaceholder: string
  noResultsText: string
  typeMoreText: string
  disabled?: boolean
}

export function EmployeeCombobox({
  value,
  onChange,
  onEmployeeChange,
  placeholder,
  searchPlaceholder,
  noResultsText,
  typeMoreText,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EmployeeSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<EmployeeSearchResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Keep a stable ref so the preselect effect can notify without being in its own dep array
  const onEmployeeChangeRef = useRef(onEmployeeChange)
  useEffect(() => { onEmployeeChangeRef.current = onEmployeeChange })

  // Resolve preselected value: fetch employee by id on mount / when value changes externally
  useEffect(() => {
    if (!value) {
      setSelected(null)
      onEmployeeChangeRef.current?.(null)
      return
    }
    // If we already have the right employee displayed, skip fetch
    if (selected?.id === value) return

    fetch(`/api/employees/search?id=${encodeURIComponent(value)}`)
      .then((r) => r.ok ? r.json() : { employees: [] })
      .then((data: { employees: EmployeeSearchResult[] }) => {
        const emp = data.employees[0] ?? null
        setSelected(emp)
        onEmployeeChangeRef.current?.(emp)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/employees/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.ok ? r.json() : { employees: [] })
        .then((data: { employees: EmployeeSearchResult[] }) => {
          setResults(data.employees)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
  }, [])

  function handleSelect(emp: EmployeeSearchResult) {
    setSelected(emp)
    setOpen(false)
    setQuery('')
    setResults([])
    onChange(emp.id)
    onEmployeeChangeRef.current?.(emp)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setQuery('')
      setResults([])
      // Focus the search input after the popover animates open
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const displayText = selected
    ? [
        `${selected.lastName} ${selected.firstName}`,
        selected.companyName || null,
      ]
        .filter(Boolean)
        .join(' — ')
    : null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className={cn('truncate text-left flex-1', !displayText && 'text-muted-foreground')}>
            {displayText ?? placeholder}
          </span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)]"
        align="start"
      >
        {/* Search input */}
        <div className="border-b px-2 py-1.5">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              runSearch(e.target.value)
            }}
            placeholder={searchPlaceholder}
            className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
        </div>

        {/* Results list */}
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <LoaderCircleIcon className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : query.length < 2 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {typeMoreText}
            </p>
          ) : results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {noResultsText}
            </p>
          ) : (
            results.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => handleSelect(emp)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left',
                  'hover:bg-muted transition-colors',
                  emp.id === value && 'bg-muted/60'
                )}
              >
                <span className="text-sm font-medium leading-none">
                  {emp.lastName} {emp.firstName}
                  {emp.companyEmployeeId ? (
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      ({emp.companyEmployeeId})
                    </span>
                  ) : null}
                </span>
                {(emp.companyName || emp.jobTitle) && (
                  <span className="text-xs text-muted-foreground truncate w-full">
                    {[emp.companyName, emp.jobTitle].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

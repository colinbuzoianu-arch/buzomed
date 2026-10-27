'use client'

import {
  Building2,
  ClipboardList,
  Clock,
  CornerDownLeft,
  MapPin,
  Search,
  User,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_DOT, type EmployeeStatusKind } from '@/components/employees/employee-status'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface SearchLabels {
  trigger: string
  placeholder: string
  recent: string
  groupEmployees: string
  groupCompanies: string
  groupExaminations: string
  groupWorkplaces: string
  empty: string
  minChars: string
  footerHint: string
  loading: string
}

type ResultType = 'employee' | 'company' | 'examination' | 'workplace'

interface SearchResult {
  type: ResultType
  id: string
  title: string
  subtitle: string
  href: string
  statusKind?: EmployeeStatusKind
}

interface ApiResults {
  employees: SearchResult[]
  companies: SearchResult[]
  examinations: SearchResult[]
  workplaces: SearchResult[]
}

const RECENT_KEY = 'buzomed:search:recent'
const RECENT_MAX = 5
const MIN_CHARS = 2
const DEBOUNCE_MS = 200

const TYPE_ICON: Record<ResultType, typeof User> = {
  employee: User,
  company: Building2,
  examination: ClipboardList,
  workplace: MapPin,
}

function loadRecent(): SearchResult[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

function saveRecent(items: SearchResult[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX)))
  } catch {
    // ignore — private mode / blocked storage
  }
}

export function GlobalSearch({ labels }: { labels: SearchLabels }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState<SearchResult[]>([])
  const [isMac, setIsMac] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent))
  }, [])

  // Global shortcuts: Ctrl/⌘+K toggles; "/" opens when focus isn't in a field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === '/' && !open) {
        const el = e.target as HTMLElement | null
        const tag = el?.tagName
        const typing =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable
        if (!typing) {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // On open: reset query, load recent, focus input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setActiveIndex(0)
      setRecent(loadRecent())
      // Radix auto-focuses the content; nudge focus to the input next frame.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < MIN_CHARS) {
      setResults(null)
      setLoading(false)
      if (abortRef.current) abortRef.current.abort()
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        })
        if (!res.ok) {
          setResults({ employees: [], companies: [], examinations: [], workplaces: [] })
          return
        }
        const data: ApiResults = await res.json()
        setResults(data)
        setActiveIndex(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults({ employees: [], companies: [], examinations: [], workplaces: [] })
        }
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const hasQuery = query.trim().length >= MIN_CHARS

  // Build the visible sections and a flat list for keyboard navigation.
  const { sections, flat } = useMemo(() => {
    const secs: Array<{ key: string; label: string; items: SearchResult[] }> = []
    if (!hasQuery) {
      if (recent.length > 0) secs.push({ key: 'recent', label: labels.recent, items: recent })
    } else if (results) {
      if (results.employees.length)
        secs.push({ key: 'employees', label: labels.groupEmployees, items: results.employees })
      if (results.companies.length)
        secs.push({ key: 'companies', label: labels.groupCompanies, items: results.companies })
      if (results.examinations.length)
        secs.push({
          key: 'examinations',
          label: labels.groupExaminations,
          items: results.examinations,
        })
      if (results.workplaces.length)
        secs.push({ key: 'workplaces', label: labels.groupWorkplaces, items: results.workplaces })
    }
    const flatList: SearchResult[] = secs.flatMap((s) => s.items)
    return { sections: secs, flat: flatList }
  }, [hasQuery, results, recent, labels])

  const select = useCallback(
    (item: SearchResult, newExam: boolean) => {
      // Remember the opened result (dedupe by type+id, most recent first).
      const next = [item, ...loadRecent().filter((r) => !(r.type === item.type && r.id === item.id))]
      saveRecent(next)
      setOpen(false)
      if (newExam && item.type === 'employee') {
        router.push(`/examinations/new?employeeId=${item.id}`)
      } else {
        router.push(item.href)
      }
    },
    [router]
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIndex]
      if (item) select(item, e.shiftKey)
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  let flatCursor = -1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 py-1.5 text-xs text-[hsl(var(--text-muted))] hover:bg-muted transition-colors"
        aria-label={labels.trigger}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">{labels.trigger}</span>
        <span className="hidden lg:inline-flex items-center gap-0.5 ml-1 font-mono text-[10px] text-[hsl(var(--text-faint))]">
          {isMac ? '⌘' : 'Ctrl'} K
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[12%] translate-y-0 sm:max-w-xl p-0 gap-0 overflow-hidden"
        >
          <DialogTitle className="sr-only">{labels.trigger}</DialogTitle>

          <div className="flex items-center gap-2 border-b px-3">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={labels.placeholder}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label={labels.placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
            {loading && flat.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
            )}
            {!loading && !hasQuery && recent.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {labels.minChars}
              </p>
            )}
            {!loading && hasQuery && flat.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
            )}

            {sections.map((section) => (
              <div key={section.key} className="py-1">
                <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--text-faint))]">
                  {section.key === 'recent' && <Clock className="w-3 h-3" />}
                  {section.label}
                </div>
                {section.items.map((item) => {
                  flatCursor += 1
                  const idx = flatCursor
                  const Icon = TYPE_ICON[item.type]
                  const active = idx === activeIndex
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      data-idx={idx}
                      onMouseMove={() => setActiveIndex(idx)}
                      onClick={(e) => select(item, e.shiftKey)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                        active ? 'bg-muted' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {item.type === 'employee' && item.statusKind && (
                          <span
                            className={cn(
                              'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-1 ring-popover',
                              STATUS_DOT[item.statusKind]
                            )}
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2 text-[11px] text-[hsl(var(--text-faint))]">
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              {labels.footerHint}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { Check, ChevronDown, Compass, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useSandboxStore } from '@/lib/sandbox/store'

/**
 * „Tur rapid" — a dismissible 6-step guided tour, bottom-right. Each step
 * links to where the action happens and ticks when done: route steps tick on
 * visit (tracked in sessionStorage), the clinical/sign steps tick from the
 * hero examination's state in the store. Reload / „Resetează demo" clears it.
 */

const DISMISS_KEY = 'buzomed-sandbox-tour-dismissed'
const VISITED_KEY = 'buzomed-sandbox-tour-visited'
const COLLAPSED_KEY = 'buzomed-sandbox-tour-collapsed'

function readSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function SandboxTour() {
  const { data } = useSandboxStore()
  const pathname = usePathname()
  const heroId = data.heroExaminationId
  const heroExam = data.examinations.find((e) => e.id === heroId)

  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(() => new Set())

  // Hydrate persisted UI state on mount (sessionStorage is client-only).
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
      setCollapsed(sessionStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {
      // ignore
    }
    setVisited(readSet(VISITED_KEY))
  }, [])

  // Record every visited sandbox path.
  // biome-ignore lint/correctness/useExhaustiveDependencies: record each visited path
  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(pathname)) return prev
      const next = new Set(prev)
      next.add(pathname)
      try {
        sessionStorage.setItem(VISITED_KEY, JSON.stringify([...next]))
      } catch {
        // ignore
      }
      return next
    })
  }, [pathname])

  const steps = useMemo(() => {
    const heroHref = `/sandbox/examinations/${heroId}`
    const clinicalDone = heroExam ? Object.keys(heroExam.clinicalExam).length > 0 : false
    const signedDone = heroExam ? heroExam.signedAt !== null : false
    return [
      { label: 'Vezi panoul „Azi"', href: '/sandbox', done: visited.has('/sandbox') },
      { label: 'Deschide examinarea în curs', href: heroHref, done: visited.has(heroHref) },
      {
        label: 'Completează clinic → „Vezi foaia"',
        href: `${heroHref}?step=1`,
        done: clinicalDone || signedDone,
      },
      { label: 'Semnează fișa de aptitudine', href: `${heroHref}?step=3`, done: signedDone },
      {
        label: 'Rapoarte › Conformitate',
        href: '/sandbox/reports/compliance',
        done: visited.has('/sandbox/reports/compliance'),
      },
      { label: 'Întreabă Iris', href: '/sandbox/iris', done: visited.has('/sandbox/iris') },
    ]
  }, [heroId, heroExam, visited])

  const doneCount = steps.filter((s) => s.done).length

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      try {
        sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }

  if (dismissed) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm font-medium shadow-lg hover:bg-muted"
      >
        <Compass className="h-4 w-4 text-primary" />
        Tur rapid
        <span className="tabular-nums text-muted-foreground">
          {doneCount}/{steps.length}
        </span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-xs rounded-xl border bg-card shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Compass className="h-4 w-4 text-primary" />
          Tur rapid
          <span className="tabular-nums font-normal text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Restrânge"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Închide turul"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
      <ol className="divide-y">
        {steps.map((step, i) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  step.done
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                    : 'border-input text-muted-foreground'
                }`}
              >
                {step.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={step.done ? 'text-muted-foreground line-through' : ''}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

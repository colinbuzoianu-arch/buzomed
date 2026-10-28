'use client'

/**
 * Sandbox store + backend shims.
 *
 * `SandboxStoreProvider` holds a single mutable copy of the fixtures in
 * memory for the life of the tab. It also installs — on mount, client-side,
 * only under /sandbox — wrappers around `window.fetch` and `window.open`
 * that keep the demo fully offline:
 *
 *   - fetch: every `/api/**` request is answered from the in-memory store
 *     (lib/sandbox/mock-api.ts). Unmatched `/api/**` paths get
 *     `{ error: 'sandbox' }` with status 200. The request NEVER reaches the
 *     network. Non-API requests (static assets, Next data) pass through.
 *   - open: document/fișă URLs map to static PDFs under /sandbox/pdfs/;
 *     any other `/api/**` open is blocked (returns null) so nothing navigates
 *     to the real backend.
 *
 * State is optionally mirrored to sessionStorage (best-effort, try/catch) so
 * edits survive in-tab navigations; reload or „Resetează demo" rebuilds the
 * fixtures from scratch.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildFixtures } from './fixtures'
import { handleApi, type MockContext, resolveStaticPdf } from './mock-api'
import type { SandboxData } from './types'

interface SandboxStoreValue {
  data: SandboxData
  mutate: (fn: (draft: SandboxData) => void) => void
  reset: () => void
}

const SandboxStoreContext = createContext<SandboxStoreValue | null>(null)

const SESSION_KEY = 'buzomed-sandbox-v1'

/**
 * Best-effort sessionStorage mirror. Dates are revived from ISO strings. Any
 * failure (private mode, quota, parse error) falls back to fresh fixtures.
 */
function reviveDates(value: unknown): unknown {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
  if (typeof value === 'string' && ISO.test(value)) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? value : d
  }
  if (Array.isArray(value)) return value.map(reviveDates)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = reviveDates(v)
    return out
  }
  return value
}

function loadInitial(): SandboxData {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY)
      if (raw) return reviveDates(JSON.parse(raw)) as SandboxData
    } catch {
      // ignore — fall through to fresh fixtures
    }
  }
  return buildFixtures(new Date())
}

// ── Backend shims, installed once at module load (client only) ──────────────
// Installed here — NOT in a React effect — so they are active before any
// sandbox component renders. Child effects run before parent effects, so a
// child that fetches on mount (e.g. the AI side panels) would otherwise
// out-race a provider-effect install and hit the real network. The provider
// points `shimContext` at its live store; until then (or after unmount) the
// shims still intercept every /api/** and answer `{ error: 'sandbox' }` — the
// request never reaches the network. See docs/sandbox-spec.md.
let shimContext: MockContext | null = null

function toSandboxUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, window.location.origin)
  if (input instanceof URL) return input
  return new URL(input.url, window.location.origin)
}

function installSandboxShims() {
  const originalFetch = window.fetch.bind(window)
  const originalOpen = window.open.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL
    try {
      url = toSandboxUrl(input)
    } catch {
      return originalFetch(input as RequestInfo, init)
    }
    // Only same-origin /api/** is intercepted; everything else passes through.
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const result = shimContext ? handleApi(url, init, shimContext) : undefined
      return new Response(JSON.stringify(result ? result.body : { error: 'sandbox' }), {
        status: result?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return originalFetch(input, init)
  }

  window.open = ((...args: Parameters<typeof window.open>): Window | null => {
    const [target] = args
    if (typeof target === 'string' || target instanceof URL) {
      let url: URL | null = null
      try {
        url = new URL(String(target), window.location.origin)
      } catch {
        url = null
      }
      if (url && url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        const pdf = resolveStaticPdf(url)
        if (pdf) return originalOpen(pdf, ...(args.slice(1) as [string?, string?]))
        // No static mapping — block rather than navigate to the backend.
        return null
      }
    }
    return originalOpen(...args)
  }) as typeof window.open
}

if (typeof window !== 'undefined') installSandboxShims()

export function SandboxStoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SandboxData>(loadInitial)

  // Keep a ref in sync so the fetch/open shims always read the latest data
  // without needing to be reinstalled on every mutation.
  const dataRef = useRef<SandboxData>(data)
  dataRef.current = data

  const persist = useCallback((next: SandboxData) => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      // ignore — in-memory state is still authoritative
    }
  }, [])

  const mutate = useCallback(
    (fn: (draft: SandboxData) => void) => {
      setData((prev) => {
        // shallow structural clone is enough: callers replace the arrays/
        // objects they touch rather than deep-mutating shared references
        const next: SandboxData = {
          ...prev,
          companies: prev.companies.slice(),
          workplaces: prev.workplaces.slice(),
          employees: prev.employees.slice(),
          examinations: prev.examinations.slice(),
          recalls: prev.recalls.slice(),
        }
        fn(next)
        persist(next)
        return next
      })
    },
    [persist]
  )

  const reset = useCallback(() => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
    const fresh = buildFixtures(new Date())
    setData(fresh)
  }, [])

  // Point the (already-installed) shims at this provider's live store. Done in
  // render so it is set before any child renders or effects run.
  shimContext = {
    get data() {
      return dataRef.current
    },
    mutate,
  }

  useEffect(() => {
    // On unmount, drop the context; the shims then answer /api with
    // { error: 'sandbox' } rather than ever reaching the network.
    return () => {
      shimContext = null
    }
  }, [])

  const value = useMemo<SandboxStoreValue>(() => ({ data, mutate, reset }), [data, mutate, reset])

  return <SandboxStoreContext.Provider value={value}>{children}</SandboxStoreContext.Provider>
}

export function useSandboxStore(): SandboxStoreValue {
  const ctx = useContext(SandboxStoreContext)
  if (!ctx) throw new Error('useSandboxStore must be used within SandboxStoreProvider')
  return ctx
}

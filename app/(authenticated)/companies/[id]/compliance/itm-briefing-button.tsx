'use client'

import { useState } from 'react'
import type { ItmBriefing, BriefingSectionSeverity } from '@/app/api/ai/itm-briefing/route'

interface Props {
  companyId: string
  year: number
}

function statusConfig(status: ItmBriefing['overallStatus']) {
  if (status === 'compliant') {
    return {
      label: 'Conformă',
      className: 'bg-green-50 border-green-200 text-green-800',
      dot: 'bg-green-500',
    }
  }
  if (status === 'at_risk') {
    return {
      label: 'Risc moderat',
      className: 'bg-amber-50 border-amber-200 text-amber-800',
      dot: 'bg-amber-500',
    }
  }
  return {
    label: 'Neconformă',
    className: 'bg-red-50 border-red-200 text-red-800',
    dot: 'bg-red-500',
  }
}

function severityIcon(severity: BriefingSectionSeverity) {
  if (severity === 'critical') return { icon: '✕', className: 'text-red-500' }
  if (severity === 'warning') return { icon: '!', className: 'text-amber-500' }
  return { icon: '✓', className: 'text-green-600' }
}

export function ItmBriefingButton({ companyId, year }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState<ItmBriefing | null>(null)
  const [error, setError] = useState(false)

  async function generate() {
    if (briefing) { setOpen(true); return }
    setLoading(true)
    setError(false)
    setOpen(true)
    try {
      const res = await fetch('/api/ai/itm-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, year }),
      })
      const data = await res.json()
      if (data.briefing) {
        setBriefing(data.briefing)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  }

  return (
    <div className="w-full">
      <button
        onClick={generate}
        disabled={loading}
        className="text-sm border rounded-md px-3 py-1 hover:bg-muted whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Se generează...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Pregătire inspecție ITM
          </>
        )}
      </button>

      {open && (
        <div className="mt-4 border rounded-lg overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Briefing pregătire inspecție ITM</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">AI</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground text-sm leading-none"
              aria-label="Închide"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Loading */}
            {loading && (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-48" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-5/6" />
                <div className="h-3 bg-muted rounded w-4/6" />
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <p className="text-sm text-muted-foreground">
                Nu s-a putut genera briefing-ul. Încearcă din nou.
              </p>
            )}

            {/* Briefing content */}
            {!loading && briefing && (
              <div className="space-y-5">
                {/* Overall status */}
                {(() => {
                  const cfg = statusConfig(briefing.overallStatus)
                  return (
                    <div className={`rounded-lg border px-4 py-3 ${cfg.className}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className="text-sm font-semibold">{cfg.label}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{briefing.overallAssessment}</p>
                    </div>
                  )
                })()}

                {/* Sections */}
                <div className="space-y-4">
                  {briefing.sections.map((section) => {
                    const { icon, className: iconClass } = severityIcon(section.severity)
                    return (
                      <div key={section.title}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold w-4 text-center ${iconClass}`}>{icon}</span>
                          <h4 className="text-sm font-semibold">{section.title}</h4>
                        </div>
                        <ul className="space-y-1 ml-6">
                          {section.items.map((item, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex gap-2">
                              <span className="text-muted-foreground/50 flex-shrink-0">–</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="border-t pt-3 flex items-center justify-between gap-4">
                  <p className="text-[11px] text-muted-foreground/70">
                    Briefing orientativ generat automat. Verificați cu un specialist înainte de inspecție.
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                    {fmtDate(briefing.generatedAt)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { CaenHazardSuggestionData } from '@/hooks/useCaenHazardSuggestion'
import { RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'

interface ExaminationType {
  id: string
  nameRo: string
}

interface ApplyOptions {
  hazardKeys: string[]
  intervalMonths: number
  examTypeIds: string[]
}

interface Props {
  caenCode: string
  data: CaenHazardSuggestionData | null
  loading: boolean
  hazardLabels: Record<string, string>
  examinationTypes: ExaminationType[]
  onApply: (opts: ApplyOptions) => void
  onDismiss: () => void
}

function matchExamTypeIds(
  aiNames: string[],
  examTypes: ExaminationType[]
): string[] {
  return examTypes
    .filter((et) =>
      aiNames.some((name) => {
        const n = name.toLowerCase().trim()
        const r = et.nameRo.toLowerCase().trim()
        return r.includes(n) || n.includes(r)
      })
    )
    .map((et) => et.id)
}

export function CaenHazardSuggestionCard({
  caenCode,
  data,
  loading,
  hazardLabels,
  examinationTypes,
  onApply,
  onDismiss,
}: Props) {
  const [selected, setSelected] = useState<string[]>([])

  // Initialise checkboxes when data arrives — all suggestions checked by default.
  useEffect(() => {
    if (data) setSelected(data.hazards)
  }, [data])

  if (!loading && !data) return null

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function handleApply() {
    if (!data) return
    const examTypeIds = matchExamTypeIds(data.examinationTypes, examinationTypes)
    onApply({ hazardKeys: selected, intervalMonths: data.intervalMonths, examTypeIds })
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-200 text-violet-800 uppercase tracking-wide">
            Sugestie AI
          </span>
          <span className="text-sm font-medium text-violet-900">
            Profil de risc — CAEN {caenCode}
          </span>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-violet-400 hover:text-violet-700 text-lg leading-none"
            aria-label="Ignoră sugestia"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-violet-600 py-1">
          <span className="inline-block w-3 h-3 rounded-full bg-violet-400 animate-pulse" />
          Se analizează codul CAEN…
        </div>
      ) : data ? (
        <>
          {/* Rationale */}
          {data.rationale && (
            <p className="text-xs text-violet-700 italic">{data.rationale}</p>
          )}

          {/* Hazard checkboxes — grouped by category */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-violet-800">
              Noxe sugerate (debifați ce nu se aplică):
            </p>
            {RISK_PROFILE_SCHEMA.map(({ category, hazards }) => {
              const suggested = hazards.filter((h) => data.hazards.includes(h))
              if (suggested.length === 0) return null
              return (
                <div key={category} className="space-y-1">
                  {suggested.map((hazardKey) => (
                    <label
                      key={hazardKey}
                      className="flex items-center gap-2 text-sm text-violet-900 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(hazardKey)}
                        onChange={() => toggle(hazardKey)}
                        className="accent-violet-600"
                      />
                      {hazardLabels[hazardKey] ?? hazardKey}
                    </label>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Interval + exam types */}
          <div className="text-xs text-violet-700 space-y-1">
            <p>
              <span className="font-medium">Interval recomandat:</span>{' '}
              {data.intervalMonths} luni
            </p>
            {data.examinationTypes.length > 0 && (
              <p>
                <span className="font-medium">Examinări recomandate:</span>{' '}
                {data.examinationTypes.join(', ')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={selected.length === 0}
              className="bg-violet-700 hover:bg-violet-800 text-white"
            >
              Aplică sugestia
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="text-violet-600 hover:text-violet-900"
            >
              Ignoră
            </Button>
          </div>
        </>
      ) : null}

      {/* Disclaimer — always visible when card is shown */}
      <p className="text-[11px] text-violet-500 border-t border-violet-200 pt-2">
        Sugestie orientativă bazată pe codul CAEN. Profilul final de risc rămâne
        responsabilitatea medicului de medicina muncii.
      </p>
    </div>
  )
}

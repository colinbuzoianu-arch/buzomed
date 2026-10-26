'use client'

import { CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import type { SheetCheck } from '@/lib/examinations/sheet-checks'
import type { Labels } from '../examination-stepper'

/**
 * Pre-sign checklist shown in the Aviz step, above the sign button
 * (control_periodic only). Deterministic, non-blocking: it never prevents
 * signing. 'fisa' rows (red) link to the employee/company edit page; 'foaie'
 * rows (grey) jump to the field in the stepper. Each row can be dismissed
 * ("lăsat gol intenționat"); dismissed ids persist in clinicalExam.
 */

interface Props {
  checks: SheetCheck[]
  dismissedIds: string[]
  locked: boolean
  showNextDateInfo: boolean
  employeeEditHref: string
  companyEditHref: string
  onJump: (step: number, fieldKey: string) => void
  onDismiss: (id: string) => void
  onUndismiss: (id: string) => void
  onReverify: () => void
  labels: Labels
}

const FISA_SHORT: Record<string, string> = {
  'fisa:jobTitle': 'Funcție',
  'fisa:cnp': 'CNP',
  'fisa:companyAddress': 'Adresa firmei',
}

export function PreSignChecklist({
  checks,
  dismissedIds,
  locked,
  showNextDateInfo,
  employeeEditHref,
  companyEditHref,
  onJump,
  onDismiss,
  onUndismiss,
  onReverify,
  labels,
}: Props) {
  const dismissed = new Set(dismissedIds)
  const active = checks.filter((c) => !dismissed.has(c.id))
  const dismissedChecks = checks.filter((c) => dismissed.has(c.id))
  const fisa = active.filter((c) => c.level === 'fisa')
  const foaie = active.filter((c) => c.level === 'foaie')

  const dismissBtn = (id: string) =>
    !locked && (
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
      >
        {labels.preSignDismiss}
      </button>
    )

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{labels.preSignTitle}</h3>

      {active.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {labels.preSignAllDone}
        </p>
      )}

      {fisa.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-red-700 dark:text-red-300">
              {labels.preSignFisaBlock}
            </span>
            <button
              type="button"
              onClick={onReverify}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900"
            >
              <RefreshCw className="h-3 w-3" />
              {labels.preSignReverify}
            </button>
          </div>
          <ul className="space-y-1">
            {fisa.map((c) => {
              const href = c.fieldKey.startsWith('employee.') ? employeeEditHref : companyEditHref
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-red-800 underline hover:no-underline dark:text-red-200"
                  >
                    {c.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {dismissBtn(c.id)}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[11px] text-red-700/80 dark:text-red-300/80">
            {labels.preSignPrintWithout}{' '}
            {fisa.map((c) => FISA_SHORT[c.id] ?? c.label).join(', ')}.
          </p>
        </div>
      )}

      {showNextDateInfo && (
        <p className="text-xs text-muted-foreground">{labels.preSignNextDateInfo}</p>
      )}

      {foaie.length > 0 && (
        <div className="rounded-md border border-dashed p-3">
          <span className="mb-2 block text-xs font-semibold text-muted-foreground">
            {labels.preSignFoaieBlock}
          </span>
          <ul className="space-y-1">
            {foaie.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onJump(c.step, c.fieldKey)}
                  className="text-left hover:underline"
                >
                  {c.label}
                </button>
                {dismissBtn(c.id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dismissedChecks.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {labels.preSignDismissed} ({dismissedChecks.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {dismissedChecks.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="line-through">{c.label}</span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => onUndismiss(c.id)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted"
                  >
                    {labels.preSignUndismiss}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

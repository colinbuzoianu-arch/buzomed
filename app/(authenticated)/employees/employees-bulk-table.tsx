'use client'

import { AlertTriangle, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { SortHeader } from '@/components/employees/sort-header'
import { computeEmployeeStatus, STATUS_DOT, STATUS_TEXT } from '@/components/employees/employee-status'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

// Dates serialized to ISO strings by the server component
interface SerializedEmployee {
  id: string
  firstName: string
  lastName: string
  companyEmployeeId: string | null
  jobTitle: string | null
  isActive: boolean
  archivedAt: string | null
  /** cnpEncrypted OR idDocumentNumber present (never the value itself). */
  hasIdNumber: boolean
  company: { name: string } | null
  workplaceAssignments: Array<{ workplace: { id: string; name: string } }>
  examinations: Array<{ completedAt: string | null; signedAt: string | null; status: string }>
  recalls: Array<{ dueDate: string; status: string }>
}

interface WorkplaceOption {
  id: string
  name: string
  company: { name: string }
}

interface StatusLabels {
  overdue: string // "Depășit de {n} zile"
  soon: string // "În {n} zile"
  ok: string // "La zi · {month}"
  never: string
  none: string
  funcMissing: string
  cnpMissing: string
  newExam: string
  lastExam: string // "Ultima examinare: {d}"
  due: string // "Scadență: {d}"
}

interface Props {
  employees: SerializedEmployee[]
  workplaces: WorkplaceOption[]
  locale: 'ro' | 'en'
  sort: string
  showArchived: boolean
  canWrite: boolean
  labels: StatusLabels
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined, locale: 'ro' | 'en' = 'ro'): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

type StatusKind = 'overdue' | 'soon' | 'ok' | 'never' | 'none'

interface StatusInfo {
  kind: StatusKind
  text: string
  dotCls: string
  textCls: string
}

/**
 * Derive the single "Status" cell for an employee. Mirrors the priority
 * buckets computed server-side so the colour/text agrees with the ordering.
 */
function statusInfo(e: SerializedEmployee, labels: StatusLabels): StatusInfo {
  const s = computeEmployeeStatus({ recall: e.recalls[0] ?? null, hasExam: e.examinations.length > 0 })
  const text =
    s.kind === 'overdue'
      ? labels.overdue.replace('{n}', String(s.days))
      : s.kind === 'soon'
        ? labels.soon.replace('{n}', String(s.days))
        : s.kind === 'ok'
          ? labels.ok.replace('{month}', s.month)
          : s.kind === 'never'
            ? labels.never
            : labels.none
  return { kind: s.kind, text, dotCls: STATUS_DOT[s.kind], textCls: STATUS_TEXT[s.kind] }
}

const REASONS = [
  { value: 'hired',             label: 'Angajare' },
  { value: 'transferred',       label: 'Transfer' },
  { value: 'promoted',          label: 'Promovare' },
  { value: 'role_change',       label: 'Schimbare rol' },
  { value: 'department_change', label: 'Schimbare departament' },
  { value: 'other',             label: 'Altul' },
]

const INPUT_CLS = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors'

// ─── Component ────────────────────────────────────────────────────────────────

export function EmployeesBulkTable({ employees, workplaces, locale, sort, showArchived, canWrite, labels }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [wpId, setWpId]               = useState('')
  const [reason, setReason]           = useState('hired')
  const [assigning, setAssigning]     = useState(false)
  const [assignResult, setAssignResult] = useState<{ success: number; failed: number } | null>(null)

  const sel = selectedIds.size
  const showCheckbox = canWrite && !showArchived

  function toggleAll() {
    setSelectedIds(sel === employees.length ? new Set() : new Set(employees.map((e) => e.id)))
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  function openDialog() {
    setWpId('')
    setReason('hired')
    setAssignResult(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    if (assignResult && assignResult.success > 0) window.location.reload()
  }

  async function handleAssign() {
    if (!wpId || sel === 0) return
    setAssigning(true)
    try {
      const resp = await fetch('/api/employees/bulk-assign-workplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds: Array.from(selectedIds), workplaceId: wpId, reason }),
      })
      const data = await resp.json()
      setAssignResult(
        resp.ok && data.summary
          ? { success: data.summary.success, failed: data.summary.failed }
          : { success: 0, failed: sel }
      )
    } catch {
      setAssignResult({ success: 0, failed: sel })
    } finally {
      setAssigning(false)
    }
  }

  const thCls = 'text-left align-middle text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]'

  return (
    <>
      {/* Desktop table — raw <table> so the header can stick on page scroll and
          table-fixed columns truncate at their edge (no horizontal overflow). */}
      <div className="hidden md:block border rounded-lg">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {showCheckbox && <col style={{ width: '36px' }} />}
            <col style={{ width: '26%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '19%' }} />
          </colgroup>
          <thead className="sticky top-14 z-20 bg-background">
            <tr className="border-b">
              {showCheckbox && (
                <th className="pl-3 py-2">
                  <input
                    type="checkbox"
                    checked={sel === employees.length && employees.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                    aria-label="Selectează toți"
                  />
                </th>
              )}
              <th className={`${thCls} pl-4 py-2`}>
                <SortHeader label="Nume" sortAsc="name_asc" sortDesc="name_desc" currentSort={sort} />
              </th>
              <th className={`${thCls} py-2`}>
                <SortHeader label="Companie" sortAsc="company_asc" sortDesc="company_desc" currentSort={sort} />
              </th>
              <th className={`${thCls} py-2`}>
                <SortHeader label="Funcție" sortAsc="jobTitle_asc" sortDesc="jobTitle_desc" currentSort={sort} />
              </th>
              <th className={`${thCls} py-2`}>
                <SortHeader label="Status" sortAsc="recall_asc" sortDesc="recall_desc" currentSort={sort} />
              </th>
              <th className={`${thCls} pr-4 py-2`}>
                <SortHeader label="Loc de muncă" sortAsc="workplace_asc" sortDesc="workplace_desc" currentSort={sort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const wp = e.workplaceAssignments[0]?.workplace
              const si = statusInfo(e, labels)
              const lastExam = e.examinations[0]
              const lastExamDate = lastExam?.signedAt ?? lastExam?.completedAt ?? null
              const recall = e.recalls[0]
              const fullName = `${e.lastName} ${e.firstName}`
              const tip = [
                labels.lastExam.replace('{d}', fmtDate(lastExamDate, locale)),
                recall ? labels.due.replace('{d}', fmtDate(recall.dueDate, locale)) : null,
              ].filter(Boolean).join(' · ')

              return (
                <tr key={e.id} className="group border-b last:border-0 hover:bg-muted/40 transition-colors">
                  {showCheckbox && (
                    <td className="pl-3 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleOne(e.id)}
                        className="rounded"
                        aria-label={`Selectează ${fullName}`}
                      />
                    </td>
                  )}
                  <td className="pl-4 pr-2 py-1.5 align-middle">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link
                        href={`/employees/${e.id}`}
                        title={fullName}
                        className="min-w-0 font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate"
                      >
                        {fullName}
                      </Link>
                      {e.companyEmployeeId && (
                        <span className="text-[10px] text-[hsl(var(--text-faint))] font-mono tabular-nums shrink-0">
                          #{e.companyEmployeeId}
                        </span>
                      )}
                      {!e.jobTitle && (
                        <span className="shrink-0 inline-flex" role="img" title={labels.funcMissing} aria-label={labels.funcMissing}>
                          <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
                        </span>
                      )}
                      {!e.hasIdNumber && (
                        <span className="shrink-0 inline-flex" role="img" title={labels.cnpMissing} aria-label={labels.cnpMissing}>
                          <AlertTriangle className="h-3 w-3 text-red-500" aria-hidden />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="pr-2 py-1.5 align-middle">
                    <span className="block truncate text-[hsl(var(--text-muted))]" title={e.company?.name ?? undefined}>
                      {e.company?.name ?? '—'}
                    </span>
                  </td>
                  <td className="pr-2 py-1.5 align-middle">
                    <span className="block truncate text-[hsl(var(--text-muted))]" title={e.jobTitle ?? undefined}>
                      {e.jobTitle ?? '—'}
                    </span>
                  </td>
                  <td className="pr-2 py-1.5 align-middle">
                    <span className="inline-flex items-center gap-1.5 min-w-0" title={tip}>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${si.dotCls}`} aria-hidden />
                      <span className={`truncate text-[13px] tabular-nums ${si.textCls}`}>{si.text}</span>
                    </span>
                  </td>
                  <td className="pr-4 py-1.5 align-middle relative">
                    {wp ? (
                      <span className="block truncate text-[hsl(var(--text-muted))]" title={wp.name}>
                        {wp.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[13px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                        Fără loc de muncă
                      </span>
                    )}
                    {canWrite && (
                      <Link
                        href={`/examinations/new?employeeId=${e.id}`}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted whitespace-nowrap"
                      >
                        <Plus className="h-3 w-3" />
                        {labels.newExam}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {employees.map((e) => {
          const lastExam = e.examinations[0]
          const lastExamDate = lastExam?.signedAt ?? lastExam?.completedAt ?? null
          const recall = e.recalls[0]
          const wp = e.workplaceAssignments[0]?.workplace

          let recallUrgency: 'overdue' | 'soon' | 'ok' | null = null
          if (recall) {
            const diffDays = Math.floor((new Date(recall.dueDate).getTime() - Date.now()) / 86_400_000)
            if (recall.status === 'overdue' || diffDays < 0) recallUrgency = 'overdue'
            else if (diffDays <= 30) recallUrgency = 'soon'
            else recallUrgency = 'ok'
          }

          return (
            <Link
              key={e.id}
              href={`/employees/${e.id}`}
              className="block border rounded-lg p-4 hover:bg-[hsl(var(--surface-tinted))] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate">{e.lastName} {e.firstName}</div>
                  {e.companyEmployeeId && (
                    <div className="text-[10px] text-[hsl(var(--text-faint))] font-mono tabular-nums">
                      #{e.companyEmployeeId}
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {e.company?.name && (
                      <div className="text-xs text-[hsl(var(--text-muted))] truncate">{e.company.name}</div>
                    )}
                    {e.jobTitle && (
                      <div className="text-xs text-[hsl(var(--text-muted))] truncate">{e.jobTitle}</div>
                    )}
                    {wp ? (
                      <div className="text-xs text-[hsl(var(--text-muted))] truncate">📍 {wp.name}</div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800 mt-0.5">
                        <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                        Fără loc de muncă
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right space-y-1.5">
                  {showArchived ? (
                    <div className="text-xs text-[hsl(var(--text-muted))] tabular-nums">
                      {e.archivedAt ? fmtDate(e.archivedAt, locale) : '—'}
                    </div>
                  ) : (
                    <>
                      {lastExamDate && (
                        <div className="text-[10px] text-[hsl(var(--text-faint))] tabular-nums">
                          {fmtDate(lastExamDate, locale)}
                        </div>
                      )}
                      {recall && (
                        <div className={`text-[11px] font-medium tabular-nums ${
                          recallUrgency === 'overdue' ? 'text-red-700'
                          : recallUrgency === 'soon' ? 'text-amber-700'
                          : 'text-[hsl(var(--text-muted))]'
                        }`}>
                          ⏱ {fmtDate(recall.dueDate, locale)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Floating bulk action bar */}
      {canWrite && !showArchived && sel > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-xl border bg-card shadow-xl px-4 py-3">
          <span className="text-sm font-medium whitespace-nowrap">{sel} angajați selectați</span>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" onClick={openDialog}>
            Asignează loc de muncă
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Anulează
          </Button>
        </div>
      )}

      {/* Assign workplace dialog */}
      {dialogOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={closeDialog} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-card rounded-xl border shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b bg-[hsl(var(--surface-muted))]/60">
                <div>
                  <h2 className="text-[15px] font-medium">Asignează loc de muncă</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{sel} angajați selectați</p>
                </div>
                <button
                  onClick={closeDialog}
                  className="rounded-md p-1.5 text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                    <path d="M1 1l12 12M13 1L1 13" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                {assignResult ? (
                  <div className={`rounded-lg border p-4 ${assignResult.failed === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                    <p className="font-medium text-sm">
                      {assignResult.failed === 0 ? '✓ Asignare finalizată' : 'Asignare finalizată cu erori'}
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      {assignResult.success} asignați cu succes
                      {assignResult.failed > 0 && `, ${assignResult.failed} erori`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[hsl(var(--text-muted))] uppercase tracking-[0.06em]">
                        Loc de muncă *
                      </label>
                      <select
                        value={wpId}
                        onChange={(e) => setWpId(e.target.value)}
                        className={INPUT_CLS}
                        disabled={assigning}
                      >
                        <option value="">— selectați —</option>
                        {workplaces.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.company.name} — {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-[hsl(var(--text-muted))] uppercase tracking-[0.06em]">
                        Motiv
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className={INPUT_CLS}
                        disabled={assigning}
                      >
                        {REASONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t flex justify-end gap-2">
                <Button variant="outline" onClick={closeDialog} disabled={assigning}>
                  {assignResult ? 'Închide' : 'Anulează'}
                </Button>
                {!assignResult && (
                  <Button onClick={handleAssign} disabled={!wpId || assigning}>
                    {assigning ? 'Se asignează…' : `Asignează la toți ${sel}`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

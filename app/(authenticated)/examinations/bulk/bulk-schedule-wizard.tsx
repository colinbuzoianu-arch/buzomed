'use client'

import { useState, useEffect, useMemo, useId } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─── Types ────────────────────────────────────────────────────────────────────

type BulkMode = 'employees' | 'recalls'

interface RecallItem {
  id: string
  employeeId: string
  employeeName: string
  companyEmployeeId: string | null
  jobTitle: string | null
  companyId: string
  companyName: string
  workplaceId: string | null
  workplaceName: string | null
  department: string | null
  examinationTypeId: string | null
  examinationTypeName: string | null
  dueDate: string | null
  status: 'pending' | 'overdue' | 'no_examination'
  daysOverdue: number | null
  hasConflict: boolean
  hasNoWorkplace?: boolean
}

interface FilterOptions {
  companies: Array<{ id: string; name: string }>
  workplaces: Array<{ id: string; name: string }>
  departments: string[]
  examinationTypes: Array<{ id: string; name: string }>
  practitioners: Array<{ id: string; label: string }>
}

interface Session {
  _key: string
  practitionerId: string
  startDatetime: string
  slotCount: number
}

interface SubmitResult {
  created: number
  failed: number
  failures: Array<{ itemId: string; reason?: string }>
}

const HORIZONS = [
  { value: 'overdue',   label: 'Restanțe' },
  { value: 'thisWeek',  label: 'Această săptămână' },
  { value: 'thisMonth', label: 'Această lună' },
  { value: 'next30',    label: '30 zile' },
  { value: 'next60',    label: '60 zile' },
  { value: 'next90',    label: '90 zile' },
  { value: 'all',       label: 'Toate' },
] as const

const SELECT_CLS = 'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// ─── Main component ───────────────────────────────────────────────────────────

export function BulkScheduleWizard({ initialCompanyId }: { initialCompanyId: string | null }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Mode toggle
  const [mode, setMode] = useState<BulkMode>('employees')

  // Filter state
  const [companyId, setCompanyId]   = useState(initialCompanyId ?? '')
  const [workplaceId, setWorkplaceId]   = useState('')
  const [department, setDepartment]     = useState('')
  const [examinationTypeId, setExaminationTypeId] = useState('')  // only for recalls mode filter
  const [horizon, setHorizon]           = useState('thisMonth')

  // Filter options (from /filters endpoint)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    companies: [], workplaces: [], departments: [], examinationTypes: [], practitioners: [],
  })

  // Results
  const [items, setItems]         = useState<RecallItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError]     = useState<string | null>(null)
  const [employeesWithoutWorkplace, setEmployeesWithoutWorkplace] = useState(0)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Step 2
  const [slotMinutes, setSlotMinutes] = useState(20)
  const [globalExamTypeId, setGlobalExamTypeId] = useState('')  // required in employees mode
  const [sessions, setSessions] = useState<Session[]>([
    { _key: 'session-0', practitionerId: '', startDatetime: '', slotCount: 0 },
  ])

  // Step 3
  const [submitting, setSubmitting]         = useState(false)
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 })
  const [submitResult, setSubmitResult]     = useState<SubmitResult | null>(null)

  // ─── Load filter options ────────────────────────────────────────────────────

  useEffect(() => {
    const url = companyId
      ? `/api/examinations/bulk-schedule/filters?companyId=${encodeURIComponent(companyId)}`
      : '/api/examinations/bulk-schedule/filters'
    fetch(url)
      .then((r) => r.json())
      .then((data: FilterOptions) => {
        setFilterOptions(data)
        setWorkplaceId('')
        setDepartment('')
      })
      .catch(() => {})
  }, [companyId])

  // ─── Fetch items ────────────────────────────────────────────────────────────

  function fetchItems() {
    setItemsLoading(true)
    setItemsError(null)
    setSelectedIds(new Set())

    const params = new URLSearchParams({ mode })
    if (companyId)   params.set('companyId', companyId)
    if (workplaceId) params.set('workplaceId', workplaceId)
    if (department)  params.set('department', department)
    if (mode === 'recalls') {
      params.set('horizon', horizon)
      if (examinationTypeId) params.set('examinationTypeId', examinationTypeId)
    }

    fetch(`/api/examinations/bulk-schedule?${params}`)
      .then((r) => r.json())
      .then((data: { recalls: RecallItem[]; total: number; employeesWithoutWorkplace?: number }) => {
        setItems(data.recalls)
        setEmployeesWithoutWorkplace(data.employeesWithoutWorkplace ?? 0)
        setItemsLoading(false)
      })
      .catch(() => {
        setItemsError('Eroare la încărcarea datelor.')
        setItemsLoading(false)
      })
  }

  // Auto-fetch when companyId or mode changes
  useEffect(() => {
    if (companyId) fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, mode])

  // ─── Mode switch ─────────────────────────────────────────────────────────────

  function switchMode(m: BulkMode) {
    setMode(m)
    setItems([])
    setSelectedIds(new Set())
  }

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const selectableItems = useMemo(() => items.filter((r) => !r.hasNoWorkplace), [items])
  const selectedItems   = useMemo(() => selectableItems.filter((r) => selectedIds.has(r.id)), [selectableItems, selectedIds])

  // Map itemId → employeeName for failure display in step 3
  const itemNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const item of items) m.set(item.id, item.employeeName)
    return m
  }, [items])

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === selectableItems.length && selectableItems.length > 0
        ? new Set()
        : new Set(selectableItems.map((r) => r.id))
    )
  }

  function toggleOne(id: string) {
    const item = items.find((r) => r.id === id)
    if (item?.hasNoWorkplace) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  // ─── Step transitions ───────────────────────────────────────────────────────

  function goToStep2() {
    setSessions([{
      _key: 'session-0',
      practitionerId: filterOptions.practitioners.length === 1
        ? filterOptions.practitioners[0].id : '',
      startDatetime: '',
      slotCount: selectedItems.length,
    }])
    setStep(2)
  }

  // ─── Session helpers ────────────────────────────────────────────────────────

  function addSession() {
    if (sessions.length >= 10) return
    setSessions((prev) => [
      ...prev,
      { _key: `session-${Date.now()}`, practitionerId: '', startDatetime: '', slotCount: 0 },
    ])
  }

  function removeSession(key: string) {
    setSessions((prev) => prev.filter((s) => s._key !== key))
  }

  function updateSession(key: string, patch: Partial<Omit<Session, '_key'>>) {
    setSessions((prev) => prev.map((s) => (s._key === key ? { ...s, ...patch } : s)))
  }

  const totalAllocated = sessions.reduce((s, ses) => s + ses.slotCount, 0)
  const totalSelected  = selectedItems.length
  const slotDiff       = totalSelected - totalAllocated

  const sessionAssignments = useMemo(() => {
    const result: Array<{ session: Session; recalls: RecallItem[] }> = []
    let cursor = 0
    for (const ses of sessions) {
      result.push({ session: ses, recalls: selectedItems.slice(cursor, cursor + ses.slotCount) })
      cursor += ses.slotCount
    }
    return result
  }, [sessions, selectedItems])

  // ─── Step 2 validation ──────────────────────────────────────────────────────

  const step2Valid =
    slotDiff === 0 &&
    sessions.every((s) => s.practitionerId && s.startDatetime) &&
    (mode === 'recalls' || globalExamTypeId !== '')

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitResult(null)

    type RecallsPostItem = { recallId: string; scheduledAt?: string }
    type EmployeesPostItem = { employeeId: string; scheduledAt?: string; examinationTypeId: string; workplaceId: string | null }
    type PostItem = RecallsPostItem | EmployeesPostItem
    type SessionBatch = { practitionerId: string; mode: BulkMode; items: PostItem[] }

    const batches: SessionBatch[] = sessionAssignments
      .filter((sa) => sa.session.practitionerId && sa.recalls.length > 0)
      .flatMap((sa) => {
        const postItems: PostItem[] = sa.recalls.map((r, i) => {
          const scheduledAt = sa.session.startDatetime
            ? new Date(new Date(sa.session.startDatetime).getTime() + i * slotMinutes * 60_000).toISOString()
            : undefined
          if (mode === 'employees') {
            return {
              employeeId: r.employeeId,
              scheduledAt,
              examinationTypeId: globalExamTypeId,
              workplaceId: r.workplaceId,
            } satisfies EmployeesPostItem
          }
          return { recallId: r.id, scheduledAt } satisfies RecallsPostItem
        })
        const chunks: SessionBatch[] = []
        for (let i = 0; i < postItems.length; i += 200) {
          chunks.push({ practitionerId: sa.session.practitionerId, mode, items: postItems.slice(i, i + 200) })
        }
        return chunks
      })

    const totalItems = batches.reduce((s, b) => s + b.items.length, 0)
    setSubmitProgress({ done: 0, total: totalItems })

    let totalCreated = 0
    let totalFailed  = 0
    const failures: SubmitResult['failures'] = []

    for (const batch of batches) {
      try {
        const resp = await fetch('/api/examinations/bulk-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ practitionerId: batch.practitionerId, mode: batch.mode, items: batch.items }),
        })
        const data = await resp.json().catch(() => ({}))
        if (resp.ok && data.summary) {
          totalCreated += data.summary.created as number
          totalFailed  += data.summary.failed  as number
          const batchFailures = (data.results as Array<{ itemId: string; outcome: string; reason?: string }>)
            .filter((r) => r.outcome === 'failed')
            .map((r) => ({ itemId: r.itemId, reason: r.reason }))
          failures.push(...batchFailures)
        } else {
          totalFailed += batch.items.length
        }
      } catch {
        totalFailed += batch.items.length
      }
      setSubmitProgress((prev) => ({ ...prev, done: prev.done + batch.items.length }))
    }

    setSubmitResult({ created: totalCreated, failed: totalFailed, failures })
    setSubmitting(false)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const emptyMessage = itemsLoading ? 'Se încarcă…' : !companyId
    ? 'Selectați o companie pentru a continua.'
    : mode === 'employees'
      ? 'Niciun angajat fără examinare activă găsit pentru filtrele selectate.'
      : 'Nicio scadență găsită pentru filtrele selectate.'

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/examinations?tab=scadente" className="hover:underline">Scadențe</Link>
          <span>›</span>
          <span>Programare în masă</span>
        </div>
        <h1 className="text-2xl font-bold">Programare în masă</h1>
      </div>

      <StepIndicator step={step} />

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mod programare</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <ModeOption
                value="employees"
                current={mode}
                label="Angajați fără examinare activă"
                description="Pentru angajați noi sau fără programare curentă — cel mai frecvent caz"
                onSelect={switchMode}
              />
              <ModeOption
                value="recalls"
                current={mode}
                label="Scadențe (recalls existente)"
                description="Pentru re-examinări periodice cu scadențe înregistrate"
                onSelect={switchMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Filter panel */}
            <aside className="space-y-4">
              <h2 className="font-semibold text-sm">Filtre</h2>

              <div className="space-y-1.5">
                <Label>Companie *</Label>
                <select
                  value={companyId}
                  onChange={(e) => { setCompanyId(e.target.value); setItems([]) }}
                  className={SELECT_CLS}
                >
                  <option value="">— selectați —</option>
                  {filterOptions.companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Loc de muncă</Label>
                <select
                  value={workplaceId}
                  onChange={(e) => setWorkplaceId(e.target.value)}
                  disabled={!companyId || filterOptions.workplaces.length === 0}
                  className={`${SELECT_CLS} disabled:opacity-50`}
                >
                  <option value="">Toate</option>
                  {filterOptions.workplaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Departament</Label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!companyId || filterOptions.departments.length === 0}
                  className={`${SELECT_CLS} disabled:opacity-50`}
                >
                  <option value="">Toate</option>
                  {filterOptions.departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Recalls-only filters */}
              {mode === 'recalls' && (
                <>
                  <div className="space-y-1.5">
                    <Label>Tip examinare</Label>
                    <select
                      value={examinationTypeId}
                      onChange={(e) => setExaminationTypeId(e.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Toate</option>
                      {filterOptions.examinationTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Perioadă</Label>
                    <select
                      value={horizon}
                      onChange={(e) => setHorizon(e.target.value)}
                      className={SELECT_CLS}
                    >
                      {HORIZONS.map((h) => (
                        <option key={h.value} value={h.value}>{h.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <Button
                onClick={fetchItems}
                disabled={!companyId || itemsLoading}
                className="w-full"
              >
                {itemsLoading ? 'Se încarcă…' : 'Aplicați filtrele'}
              </Button>
            </aside>

            {/* Results panel */}
            <div className="space-y-3">
              {itemsError && (
                <p className="text-sm text-destructive">{itemsError}</p>
              )}

              {items.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedIds.size}</span> din{' '}
                    {selectableItems.length} selectați
                    {employeesWithoutWorkplace > 0 && mode === 'employees' && (
                      <span className="text-amber-700 ml-1">
                        ({employeesWithoutWorkplace} fără loc de muncă)
                      </span>
                    )}
                  </span>
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selectedIds.size === selectableItems.length && selectableItems.length > 0
                      ? 'Deselectează tot' : 'Selectează tot'}
                  </Button>
                </div>
              )}

              {itemsLoading ? (
                <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
                  Se încarcă…
                </div>
              ) : items.length === 0 ? (
                <div className="border border-dashed rounded-lg p-12 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide border-b">
                        <tr>
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={selectedIds.size === selectableItems.length && selectableItems.length > 0}
                              onChange={toggleAll}
                              className="rounded"
                            />
                          </th>
                          <th className="text-left px-3 py-2">Angajat</th>
                          <th className="text-left px-3 py-2">Loc de muncă</th>
                          <th className="text-left px-3 py-2">Departament</th>
                          {mode === 'employees' && (
                            <th className="text-left px-3 py-2">Funcție</th>
                          )}
                          {mode === 'recalls' && (
                            <>
                              <th className="text-left px-3 py-2">Tip examinare</th>
                              <th className="text-left px-3 py-2 whitespace-nowrap">Scadență</th>
                              <th className="text-left px-3 py-2">Status</th>
                              <th className="text-left px-3 py-2">Conflict</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((r) => (
                          <tr
                            key={r.id}
                            className={`${r.hasNoWorkplace ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/20 cursor-pointer'} ${
                              r.status === 'overdue' ? 'bg-destructive/5' : ''
                            }`}
                            onClick={() => !r.hasNoWorkplace && toggleOne(r.id)}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(r.id)}
                                onChange={() => toggleOne(r.id)}
                                disabled={r.hasNoWorkplace}
                                className="rounded disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium whitespace-nowrap">
                              {r.employeeName}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {r.hasNoWorkplace ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  Fără loc de muncă
                                </span>
                              ) : (r.workplaceName ?? '—')}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{r.department ?? '—'}</td>
                            {mode === 'employees' && (
                              <td className="px-3 py-2 text-muted-foreground">{r.jobTitle ?? '—'}</td>
                            )}
                            {mode === 'recalls' && (
                              <>
                                <td className="px-3 py-2 text-muted-foreground">{r.examinationTypeName ?? '—'}</td>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                                  {r.dueDate ? formatShortDate(r.dueDate) : '—'}
                                </td>
                                <td className="px-3 py-2">
                                  {r.status === 'overdue' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                      Restanță{r.daysOverdue ? ` (${r.daysOverdue}z)` : ''}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                      Scadent curând
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {r.hasConflict && (
                                    <span
                                      title="Are examinare programată"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
                                    >
                                      ⚠ Programat
                                    </span>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 border-t text-xs text-muted-foreground bg-muted/20">
                    {items.length} {mode === 'employees' ? 'angajați' : 'scadențe'}
                  </div>
                </div>
              )}

              {mode === 'employees' && employeesWithoutWorkplace > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="shrink-0">⚠</span>
                  <span>
                    <strong>{employeesWithoutWorkplace}</strong> angajați nu pot fi programați deoarece nu au un loc de muncă asignat.
                    Asignați-le un loc de muncă din fișa angajatului sau folosiți asignarea în masă din{' '}
                    <a href="/employees?wp=no_workplace" className="underline hover:text-amber-700">lista angajați</a>,
                    apoi reveniți aici.
                  </span>
                </div>
              )}

              {items.length > 0 && (
                <div className="flex justify-end">
                  <Button onClick={goToStep2} disabled={selectedIds.size === 0}>
                    Continuați cu {selectedIds.size} selecții →
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="space-y-6 max-w-3xl">
          {/* Global exam type — required in employees mode */}
          {mode === 'employees' && (
            <div className="border rounded-lg p-4 bg-muted/10 space-y-2">
              <div className="space-y-1.5">
                <Label>
                  Tip examinare pentru toți angajații *
                </Label>
                <select
                  value={globalExamTypeId}
                  onChange={(e) => setGlobalExamTypeId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">— selectați —</option>
                  {filterOptions.examinationTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="space-y-1.5">
              <Label>Interval per examinare (minute)</Label>
              <Input
                type="number"
                value={slotMinutes}
                min={5}
                max={60}
                onChange={(e) => setSlotMinutes(Math.max(5, Math.min(60, Number(e.target.value))))}
                className="w-24"
              />
            </div>
            <div className="self-end pb-1 text-sm text-muted-foreground">
              {totalSelected} angajați selectați
            </div>
          </div>

          <div className="space-y-4">
            {sessions.map((ses, idx) => {
              const assignment = sessionAssignments[idx]
              const endTime = ses.startDatetime && ses.slotCount > 0
                ? new Date(new Date(ses.startDatetime).getTime() + (ses.slotCount - 1) * slotMinutes * 60_000)
                : null
              return (
                <SessionBlock
                  key={ses._key}
                  index={idx + 1}
                  session={ses}
                  practitioners={filterOptions.practitioners}
                  endTime={endTime}
                  previewItems={assignment?.recalls.slice(0, 3) ?? []}
                  totalInSession={ses.slotCount}
                  onUpdate={(patch) => updateSession(ses._key, patch)}
                  onRemove={sessions.length > 1 ? () => removeSession(ses._key) : undefined}
                />
              )
            })}
          </div>

          {sessions.length < 10 && (
            <Button variant="outline" onClick={addSession} size="sm">+ Adaugă sesiune</Button>
          )}

          {slotDiff !== 0 && (
            <p className={`text-sm ${slotDiff > 0 ? 'text-destructive' : 'text-amber-600'}`}>
              {slotDiff > 0
                ? `${slotDiff} programări nealocate`
                : `${-slotDiff} locuri în plus față de selecție`}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Înapoi</Button>
            <Button onClick={() => setStep(3)} disabled={!step2Valid}>
              Previzualizare →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && !submitResult && (
        <div className="space-y-6 max-w-4xl">
          <h2 className="font-semibold">Previzualizare programare</h2>

          {mode === 'employees' && globalExamTypeId && (
            <p className="text-sm text-muted-foreground">
              Tip examinare:{' '}
              <strong>
                {filterOptions.examinationTypes.find((t) => t.id === globalExamTypeId)?.name ?? '—'}
              </strong>
            </p>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Angajat</th>
                    <th className="text-left px-3 py-2">Sesiune</th>
                    <th className="text-left px-3 py-2">Medic</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">Programat la</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessionAssignments.flatMap(({ session, recalls: sItems }, si) =>
                    sItems.map((r, ri) => {
                      const pracLabel = filterOptions.practitioners.find(
                        (p) => p.id === session.practitionerId
                      )?.label ?? session.practitionerId
                      const scheduledAt = session.startDatetime
                        ? new Date(new Date(session.startDatetime).getTime() + ri * slotMinutes * 60_000)
                        : null
                      return (
                        <tr key={r.id}>
                          <td className="px-3 py-2 font-medium">{r.employeeName}</td>
                          <td className="px-3 py-2 text-muted-foreground">Sesiunea {si + 1}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{pracLabel}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {scheduledAt ? formatDatetime(scheduledAt) : '—'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>{totalSelected}</strong> examinări în <strong>{sessions.length}</strong> sesiuni</p>
            {sessions.map((ses, i) => {
              const prac = filterOptions.practitioners.find((p) => p.id === ses.practitionerId)
              return (
                <p key={ses._key} className="text-xs">
                  Sesiunea {i + 1}: {prac?.label} · {ses.slotCount} locuri ·{' '}
                  {ses.startDatetime ? formatDatetime(new Date(ses.startDatetime)) : '—'}
                </p>
              )
            })}
          </div>

          {submitting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Se creează examinările…</span>
                <span>{submitProgress.done} / {submitProgress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: submitProgress.total > 0
                      ? `${(submitProgress.done / submitProgress.total) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>← Înapoi</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Se procesează…' : `Confirmare programare în masă (${totalSelected})`}
            </Button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {submitResult && (
        <div className="space-y-4 max-w-2xl">
          <div className={`rounded-lg border p-4 space-y-2 ${
            submitResult.failed === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
          }`}>
            <p className="font-semibold">
              {submitResult.failed === 0
                ? '✓ Programare finalizată cu succes'
                : 'Programare finalizată cu erori parțiale'}
            </p>
            <p className="text-sm">
              <strong>{submitResult.created}</strong> examinări create
              {submitResult.failed > 0 && (
                <>, <strong>{submitResult.failed}</strong> eșuate</>
              )}
            </p>
          </div>

          {submitResult.failures.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 text-xs font-medium uppercase tracking-wide">
                Erori ({submitResult.failures.length})
              </div>
              <div className="divide-y text-sm">
                {submitResult.failures.map((f) => (
                  <div key={f.itemId} className="px-3 py-2 flex justify-between gap-4">
                    <span className="font-medium text-sm">
                      {itemNameMap.get(f.itemId) ?? f.itemId}
                    </span>
                    <span className="text-destructive text-xs shrink-0">
                      {translateFailureReason(f.reason)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button asChild variant="outline">
            <Link href="/examinations?tab=scadente">← Înapoi la scadențe</Link>
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Failure reason translations ─────────────────────────────────────────────

function translateFailureReason(reason: string | undefined): string {
  switch (reason) {
    case 'no_workplace':         return 'Fără loc de muncă asignat'
    case 'employee_unavailable': return 'Angajat inactiv sau arhivat'
    case 'workplace_unavailable':return 'Loc de muncă inactiv'
    case 'exam_type_inactive':   return 'Tip examinare inactiv'
    case 'already_scheduled':    return 'Are deja o examinare programată'
    case 'unexpected_error':     return 'Eroare neașteptată'
    default:                     return reason ?? 'eroare'
  }
}

// ─── ModeOption ───────────────────────────────────────────────────────────────

function ModeOption({
  value,
  current,
  label,
  description,
  onSelect,
}: {
  value: BulkMode
  current: BulkMode
  label: string
  description: string
  onSelect: (m: BulkMode) => void
}) {
  const selected = value === current
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex items-start gap-3 flex-1 rounded-lg border p-3 text-left transition-all ${
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-primary' : 'border-muted-foreground'
      }`}>
        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
      </span>
      <div>
        <p className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ─── SessionBlock ─────────────────────────────────────────────────────────────

function SessionBlock({
  index,
  session,
  practitioners,
  endTime,
  previewItems,
  totalInSession,
  onUpdate,
  onRemove,
}: {
  index: number
  session: Session
  practitioners: Array<{ id: string; label: string }>
  endTime: Date | null
  previewItems: RecallItem[]
  totalInSession: number
  onUpdate: (patch: Partial<Omit<Session, '_key'>>) => void
  onRemove?: () => void
}) {
  const labelId = useId()
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Sesiunea {index}</h3>
        {onRemove && (
          <button onClick={onRemove} className="text-xs text-muted-foreground hover:text-destructive">
            Șterge
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${labelId}-prac`}>Medic</Label>
          <select
            id={`${labelId}-prac`}
            value={session.practitionerId}
            onChange={(e) => onUpdate({ practitionerId: e.target.value })}
            className={SELECT_CLS}
          >
            <option value="">— selectați —</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${labelId}-dt`}>Data și ora de start</Label>
          <Input
            id={`${labelId}-dt`}
            type="datetime-local"
            value={session.startDatetime}
            onChange={(e) => onUpdate({ startDatetime: e.target.value })}
          />
          {endTime && (
            <p className="text-xs text-muted-foreground">Sfârșit estimat: {formatDatetime(endTime)}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${labelId}-slots`}>Număr locuri</Label>
          <Input
            id={`${labelId}-slots`}
            type="number"
            value={session.slotCount}
            min={0}
            onChange={(e) => onUpdate({ slotCount: Math.max(0, Number(e.target.value)) })}
            className="w-24"
          />
        </div>
      </div>

      {previewItems.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Primii angajați:{' '}
          {previewItems.map((r) => r.employeeName).join(', ')}
          {totalInSession > previewItems.length && ` +${totalInSession - previewItems.length} alții`}
        </div>
      )}
    </div>
  )
}

// ─── StepIndicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Selectare' },
    { n: 2, label: 'Configurare sesiuni' },
    { n: 3, label: 'Confirmare' },
  ]
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
            step === s.n ? 'bg-primary text-primary-foreground'
              : step > s.n ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            {s.n}
          </div>
          <span className={step === s.n ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-muted-foreground mx-1">›</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDatetime(d: Date): string {
  return d.toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

'use client'

import { useMemo, useState } from 'react'
import type { FiseListRow } from '@/lib/hr/fise'

const MAX_PER_ZIP = 500

export interface FiseLabels {
  navLabel: string
  title: string
  subtitle: string
  newBadge: string
  search: string
  allCompanies: string
  allWorkplaces: string
  allVerdicts: string
  allTypes: string
  from: string
  to: string
  reset: string
  verdict: Record<string, string>
  table: {
    employee: string
    job: string
    workplace: string
    type: string
    verdict: string
    examDate: string
    dueDate: string
    number: string
    actions: string
  }
  revoked: string
  revokedOn: string
  replacedBy: string
  download: string
  downloadSelected: string
  downloadAll: string
  selectAll: string
  tableCount: string
  empty: string
  emptyAll: string
  tooManyForZip: string
  downloading: string
  downloadError: string
}

interface Company {
  id: string
  name: string
  city: string | null
}

interface Props {
  rows: FiseListRow[]
  companies: Company[]
  newSince: number
  locale: string
  labels: FiseLabels
  initialSearch?: string
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))

export function FiseClient({ rows, companies, newSince, locale, labels, initialSearch = '' }: Props) {
  const intlLocale = locale === 'ro' ? 'ro-RO' : 'en-GB'
  const [companyId, setCompanyId] = useState('all')
  const [workplaceId, setWorkplaceId] = useState('all')
  const [verdict, setVerdict] = useState('all')
  const [examType, setExamType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState(initialSearch)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  const workplaceOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      if (companyId !== 'all' && r.companyId !== companyId) continue
      if (r.workplaceId) map.set(r.workplaceId, r.workplaceName)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, intlLocale))
  }, [rows, companyId, intlLocale])

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.examTypeCode, r.examTypeName)
    return [...map.entries()].map(([code, name]) => ({ code, name }))
  }, [rows])

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter((r) => {
      if (companyId !== 'all' && r.companyId !== companyId) return false
      if (workplaceId !== 'all' && r.workplaceId !== workplaceId) return false
      if (verdict !== 'all' && r.verdict !== verdict) return false
      if (examType !== 'all' && r.examTypeCode !== examType) return false
      const d = r.examDate.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      if (terms.length > 0) {
        const name = `${r.lastName} ${r.firstName}`.toLowerCase()
        if (!terms.every((t) => name.includes(t))) return false
      }
      return true
    })
  }, [rows, companyId, workplaceId, verdict, examType, from, to, search])

  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered])
  const selectedInFilter = filteredIds.filter((id) => selected.has(id))
  const allSelected = filtered.length > 0 && selectedInFilter.length === filtered.length

  const hasFilters =
    companyId !== 'all' || workplaceId !== 'all' || verdict !== 'all' || examType !== 'all' || !!from || !!to || !!search

  const reset = () => {
    setCompanyId('all')
    setWorkplaceId('all')
    setVerdict('all')
    setExamType('all')
    setFrom('')
    setTo('')
    setSearch('')
  }

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) for (const id of filteredIds) next.delete(id)
      else for (const id of filteredIds) next.add(id)
      return next
    })

  async function downloadOne(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/hr/fise/${id}/pdf`)
      if (!res.ok) throw new Error('failed')
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      setError(labels.downloadError)
    } finally {
      setBusy(false)
    }
  }

  async function downloadZip(ids: string[]) {
    if (ids.length === 0) return
    if (ids.length > MAX_PER_ZIP) {
      setError(fill(labels.tooManyForZip, { max: MAX_PER_ZIP }))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/hr/fise/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examinationIds: ids }),
      })
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fise_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError(labels.downloadError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{labels.title}</h1>
            {newSince > 0 && (
              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                {fill(labels.newBadge, { count: newSince })}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">{labels.subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <p>{labels.emptyAll}</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {companies.length > 1 && (
              <select
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value)
                  setWorkplaceId('all')
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">{labels.allCompanies}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {workplaceOptions.length > 1 && (
              <select value={workplaceId} onChange={(e) => setWorkplaceId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">{labels.allWorkplaces}</option>
                {workplaceOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">{labels.allVerdicts}</option>
              {Object.entries(labels.verdict).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {typeOptions.length > 1 && (
              <select value={examType} onChange={(e) => setExamType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">{labels.allTypes}</option>
                {typeOptions.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              {labels.from}
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              {labels.to}
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.search}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] flex-1"
            />
            {hasFilters && (
              <button type="button" onClick={reset} className="h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground border border-input hover:bg-accent">
                {labels.reset}
              </button>
            )}
          </div>

          {/* Bulk actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadZip(selectedInFilter)}
              disabled={busy || selectedInFilter.length === 0}
              className="h-9 px-3 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-40"
            >
              {fill(labels.downloadSelected, { count: selectedInFilter.length })}
            </button>
            <button
              type="button"
              onClick={() => downloadZip(filteredIds)}
              disabled={busy || filtered.length === 0}
              className="h-9 px-3 rounded-md text-sm border border-input hover:bg-accent disabled:opacity-40"
            >
              {fill(labels.downloadAll, { count: filtered.length })}
            </button>
            {busy && <span className="text-xs text-muted-foreground">{labels.downloading}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <p>{labels.empty}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--surface-muted))]/60 border-b">
                    <tr>
                      <th className="px-3 py-3 w-9">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={labels.selectAll} />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.employee}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.job}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.type}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.verdict}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.examDate}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.dueDate}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{labels.table.number}</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">{labels.table.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((r) => (
                      <tr key={r.id} className={`bg-white hover:bg-[hsl(var(--surface-muted))]/30 ${r.isRevoked ? 'opacity-70' : ''}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} aria-label={`${r.lastName} ${r.firstName}`} />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {r.lastName} {r.firstName}
                          <div className="text-xs text-muted-foreground/70">{r.workplaceName}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.jobTitle || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.examTypeName}</td>
                        <td className="px-4 py-3">{r.verdict ? (labels.verdict[r.verdict] ?? r.verdict) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtDate(r.examDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtDate(r.nextDueDate)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {r.examinationNumber}
                          {r.isRevoked && (
                            <div className="mt-0.5">
                              <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-medium">
                                {labels.revoked}
                              </span>
                              {r.replacementNumber && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {fill(labels.replacedBy, { number: r.replacementNumber })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => downloadOne(r.id)}
                            disabled={busy}
                            className="text-primary hover:underline disabled:opacity-40 text-sm"
                          >
                            {labels.download}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-[hsl(var(--surface-muted))]/30">
                {fill(labels.tableCount, { shown: filtered.length, total: rows.length })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

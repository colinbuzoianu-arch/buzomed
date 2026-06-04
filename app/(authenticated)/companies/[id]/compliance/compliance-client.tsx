'use client'

import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import type { ComplianceData } from '@/lib/reports/compliance-data'

// ── Year selector ──────────────────────────────────────────────────────────────

export function YearSelector({ companyId, year }: { companyId: string; year: number }) {
  const router = useRouter()
  const years = [2024, 2025, 2026]
  return (
    <select
      value={year}
      onChange={(e) => router.replace(`/companies/${companyId}/compliance?year=${e.target.value}`)}
      className="border rounded-md px-2 py-1 text-sm bg-background"
    >
      {years.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  )
}

// ── Workplace table ────────────────────────────────────────────────────────────

type WpRow = ComplianceData['workplaceBreakdown'][number]
type WpSortCol = 'workplaceName' | 'totalEmployees' | 'validFisa' | 'expired' | 'neverExamined' | 'coverageRate'

export function WorkplaceTable({ workplaceBreakdown }: { workplaceBreakdown: WpRow[] }) {
  const [sortCol, setSortCol] = useState<WpSortCol>('workplaceName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(col: WpSortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...workplaceBreakdown].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'workplaceName') {
        cmp = a.workplaceName.localeCompare(b.workplaceName, 'ro')
      } else if (sortCol === 'coverageRate') {
        cmp = (a.coverageRate ?? -1) - (b.coverageRate ?? -1)
      } else {
        cmp = (a[sortCol] as number) - (b[sortCol] as number)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [workplaceBreakdown, sortCol, sortDir])

  function SortIcon({ col }: { col: WpSortCol }) {
    if (col !== sortCol) return <span className="text-muted-foreground/40 ml-1">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function coverageClass(rate: number | null) {
    if (rate === null) return 'text-muted-foreground'
    if (rate >= 90) return 'text-green-600 font-semibold'
    if (rate >= 70) return 'text-amber-600 font-semibold'
    return 'text-red-600 font-semibold'
  }

  const cols: { key: WpSortCol; label: string }[] = [
    { key: 'workplaceName', label: 'Loc de muncă' },
    { key: 'totalEmployees', label: 'Total' },
    { key: 'validFisa', label: 'Valabili' },
    { key: 'expired', label: 'Expirați' },
    { key: 'neverExamined', label: 'Neexaminați' },
    { key: 'coverageRate', label: 'Conformitate' },
  ]

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className="text-left px-4 py-2 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort(c.key)}
              >
                {c.label}<SortIcon col={c.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((wp) => (
            <tr key={wp.workplaceId}>
              <td className="px-4 py-2 font-medium">{wp.workplaceName}</td>
              <td className="px-4 py-2 text-muted-foreground">{wp.totalEmployees}</td>
              <td className="px-4 py-2 text-green-700">{wp.validFisa}</td>
              <td className="px-4 py-2 text-red-600">{wp.expired}</td>
              <td className="px-4 py-2 text-amber-600">{wp.neverExamined}</td>
              <td className={`px-4 py-2 ${coverageClass(wp.coverageRate)}`}>
                {wp.coverageRate !== null ? `${wp.coverageRate}%` : '—'}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                Niciun loc de muncă activ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Employee list ──────────────────────────────────────────────────────────────

type EmpRow = ComplianceData['employeeList'][number]

const PAGE_SIZE = 50

export function EmployeeList({ employeeList }: { employeeList: EmpRow[] }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return employeeList
    return employeeList.filter(
      (e) =>
        `${e.lastName} ${e.firstName}`.toLowerCase().includes(q) ||
        (e.workplaceName ?? '').toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q)
    )
  }, [employeeList, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSearch(val: string) {
    setSearch(val)
    setPage(0)
  }

  function statusBadge(status: EmpRow['status']) {
    if (status === 'valid') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Valabil</span>
    if (status === 'expired') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Expirat</span>
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Neexaminat</span>
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
  }

  const VERDICT_LABELS: Record<string, string> = {
    apt: 'Apt',
    apt_conditionat: 'Apt condiționat',
    inapt_temporar: 'Inapt temporar',
    inapt: 'Inapt',
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Caută angajat, funcție, loc de muncă..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm flex-1 max-w-sm bg-background"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'angajat' : 'angajați'}
        </span>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Angajat</th>
              <th className="text-left px-4 py-2">Funcție</th>
              <th className="text-left px-4 py-2">Loc de muncă</th>
              <th className="text-left px-4 py-2">Ultima fișă</th>
              <th className="text-left px-4 py-2">Verdict</th>
              <th className="text-left px-4 py-2">Scadență</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageData.map((emp) => (
              <tr key={emp.id}>
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  {emp.lastName} {emp.firstName}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{emp.jobTitle ?? '—'}</td>
                <td className="px-4 py-2 text-muted-foreground">{emp.workplaceName ?? '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(emp.lastExamDate)}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {emp.lastVerdict ? (VERDICT_LABELS[emp.lastVerdict] ?? emp.lastVerdict) : '—'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(emp.nextDueDate)}</td>
                <td className="px-4 py-2">{statusBadge(emp.status)}</td>
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Niciun rezultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 border rounded-md disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-muted-foreground">
            Pagina {page + 1} din {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1 border rounded-md disabled:opacity-40"
          >
            Următor →
          </button>
        </div>
      )}
    </div>
  )
}

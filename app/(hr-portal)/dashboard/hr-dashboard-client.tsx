'use client'

import { useState, useMemo } from 'react'

type Status = 'valid' | 'expiringSoon' | 'expired' | 'noExamination'

interface EmployeeRow {
  id: string
  firstName: string
  lastName: string
  jobTitle: string
  companyId: string
  workplace: string
  verdict: string | null
  nextExaminationDueDate: string | null
  status: Status
}

interface Company {
  id: string
  name: string
  city: string | null
}

interface Summary {
  total: number
  apt: number
  expiringSoon: number
  missing: number
}

interface Props {
  rows: EmployeeRow[]
  summary: Summary
  companies: Company[]
}

const VERDICT_LABELS: Record<string, string> = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
}

function StatusBadge({ status, verdict }: { status: Status; verdict: string | null }) {
  if (status === 'noExamination') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Lipsă examinare
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Expirat
      </span>
    )
  }
  if (status === 'expiringSoon') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Expiră curând
      </span>
    )
  }
  // valid
  if (verdict === 'apt') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Apt
      </span>
    )
  }
  if (verdict === 'apt_conditionat') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Apt condiționat
      </span>
    )
  }
  if (verdict === 'inapt_temporar' || verdict === 'inapt') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {VERDICT_LABELS[verdict] ?? verdict}
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">—</span>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function HrDashboardClient({ rows, summary, companies }: Props) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')

  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((c) => [c.id, c.name])),
    [companies]
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (selectedCompanyId !== 'all' && r.companyId !== selectedCompanyId) {
          return false
        }
        if (statusFilter !== 'all' && r.status !== statusFilter) {
          return false
        }
        return true
      }),
    [rows, selectedCompanyId, statusFilter]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Situație angajați</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Status examene medicale · doar date operaționale, fără informații medicale
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total angajați"
          value={summary.total}
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <SummaryCard
          label="Apți"
          value={summary.apt}
          colorClass="text-green-700"
          onClick={() => setStatusFilter('valid')}
          active={statusFilter === 'valid'}
        />
        <SummaryCard
          label="Expiră în 30 zile"
          value={summary.expiringSoon}
          colorClass="text-amber-600"
          onClick={() => setStatusFilter('expiringSoon')}
          active={statusFilter === 'expiringSoon'}
        />
        <SummaryCard
          label="Lipsă / expirat"
          value={summary.missing}
          colorClass="text-red-600"
          onClick={() => setStatusFilter('expired')}
          active={statusFilter === 'expired' || statusFilter === 'noExamination'}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {companies.length > 1 && (
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Toate companiile</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">Toate statusurile</option>
          <option value="valid">Apt / Valid</option>
          <option value="expiringSoon">Expiră curând</option>
          <option value="expired">Expirat</option>
          <option value="noExamination">Lipsă examinare</option>
        </select>

        {(statusFilter !== 'all' || selectedCompanyId !== 'all') && (
          <button
            onClick={() => {
              setStatusFilter('all')
              setSelectedCompanyId('all')
            }}
            className="h-9 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground border border-input hover:bg-accent transition-colors"
          >
            Resetează filtrele
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p>Niciun angajat nu corespunde filtrelor selectate.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--surface-muted))]/60 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Angajat
                  </th>
                  {companies.length > 1 && (
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Companie
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Funcție / Loc de muncă
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Verdict
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Scadență
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((row) => (
                  <tr key={row.id} className="bg-white hover:bg-[hsl(var(--surface-muted))]/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {row.lastName} {row.firstName}
                    </td>
                    {companies.length > 1 && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {companyMap[row.companyId] ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{row.jobTitle || '—'}</div>
                      {row.workplace && (
                        <div className="text-xs text-muted-foreground/70">
                          {row.workplace}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.verdict
                        ? (VERDICT_LABELS[row.verdict] ?? row.verdict)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {formatDate(row.nextExaminationDueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} verdict={row.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-[hsl(var(--surface-muted))]/30">
            {filtered.length} din {rows.length} angajați
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  colorClass,
  onClick,
  active,
}: {
  label: string
  value: number
  colorClass?: string
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
        active ? 'border-primary bg-primary/5 shadow-sm' : 'bg-white hover:bg-[hsl(var(--surface-muted))]/40'
      }`}
    >
      <div className={`text-2xl font-bold ${colorClass ?? 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </button>
  )
}

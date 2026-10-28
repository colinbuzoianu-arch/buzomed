'use client'

import { useMemo } from 'react'
import { computeEmployeeStatus } from '@/components/employees/employee-status'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { sandboxT as t } from '@/lib/sandbox/i18n'
import { useSandboxStore } from '@/lib/sandbox/store'

const READONLY_TOOLTIP = 'În demo, fișele se deschid doar din examinări.'

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarPalette(name: string): string {
  const palettes = [
    'bg-blue-50 text-blue-800',
    'bg-emerald-50 text-emerald-800',
    'bg-amber-50 text-amber-800',
    'bg-violet-50 text-violet-800',
    'bg-rose-50 text-rose-800',
    'bg-teal-50 text-teal-800',
    'bg-indigo-50 text-indigo-800',
    'bg-orange-50 text-orange-800',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return palettes[Math.abs(hash) % palettes.length]
}

function coverageColor(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function SandboxCompaniesPage() {
  const { data } = useSandboxStore()

  const rows = useMemo(() => {
    const recallByEmp = new Map<string, { dueDate: string; status: string }>()
    for (const r of data.recalls) {
      if (r.status !== 'pending' && r.status !== 'scheduled' && r.status !== 'overdue') continue
      const ymd = `${r.dueDate.getFullYear()}-${String(r.dueDate.getMonth() + 1).padStart(2, '0')}-${String(r.dueDate.getDate()).padStart(2, '0')}`
      const existing = recallByEmp.get(r.employeeId)
      if (!existing || ymd < existing.dueDate)
        recallByEmp.set(r.employeeId, { dueDate: ymd, status: r.status })
    }
    const examEmpIds = new Set(
      data.examinations.filter((e) => e.status === 'completed').map((e) => e.employeeId)
    )

    return data.companies.map((c) => {
      const emps = data.employees.filter((e) => e.companyId === c.id && e.archivedAt === null)
      let covered = 0
      for (const e of emps) {
        const s = computeEmployeeStatus({
          recall: recallByEmp.get(e.id) ?? null,
          hasExam: examEmpIds.has(e.id),
        })
        if (s.kind !== 'overdue' && s.kind !== 'never') covered++
      }
      const coverage = emps.length === 0 ? 0 : Math.round((covered / emps.length) * 100)
      return { company: c, count: emps.length, coverage }
    })
  }, [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t('companies.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('companies.subtitle')}</p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                {t('companies.table.name')}
              </TableHead>
              <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                {t('companies.table.cui')}
              </TableHead>
              <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                {t('common.city')}
              </TableHead>
              <TableHead className="text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                {t('companies.table.employees')}
              </TableHead>
              <TableHead className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))] w-44">
                Acoperire
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ company: c, count, coverage }) => (
              <TableRow key={c.id} title={READONLY_TOOLTIP} className="cursor-default">
                <TableCell className="font-medium">
                  <span className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${avatarPalette(c.name)}`}
                      aria-hidden
                    >
                      {companyInitials(c.name)}
                    </span>
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.industry}</span>
                  </span>
                </TableCell>
                <TableCell className="text-[hsl(var(--text-muted))] text-sm tabular-nums">
                  {c.cui}
                </TableCell>
                <TableCell className="text-[hsl(var(--text-muted))] text-sm">{c.city}</TableCell>
                <TableCell className="text-right tabular-nums text-sm text-foreground">
                  {count}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                      <span
                        className={`block h-full ${coverageColor(coverage)}`}
                        style={{ width: `${coverage}%` }}
                      />
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">
                      {coverage}%
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map(({ company: c, count, coverage }) => (
          <div
            key={c.id}
            title={READONLY_TOOLTIP}
            className="block border rounded-lg p-4 cursor-default"
          >
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${avatarPalette(c.name)}`}
                aria-hidden
              >
                {companyInitials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-[hsl(var(--text-muted))] mt-1 space-y-0.5 tabular-nums">
                  <div className="truncate">CUI: {c.cui}</div>
                  <div className="truncate">
                    {t('common.city')}: {c.city}
                  </div>
                  <div className="truncate text-foreground font-medium pt-0.5">
                    {count} {t('companies.table.employees').toLowerCase()} · {coverage}% acoperire
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

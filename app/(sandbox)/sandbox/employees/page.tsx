'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { EmployeesBulkTable } from '@/app/(authenticated)/employees/employees-bulk-table'
import {
  EmployeeOverviewStrip,
  type OverviewCounts,
} from '@/components/employees/employee-overview-strip'
import { computeEmployeeStatus } from '@/components/employees/employee-status'
import { FilterChip } from '@/components/examinations/filter-chip'
import { sandboxT as t } from '@/lib/sandbox/i18n'
import { useSandboxStore } from '@/lib/sandbox/store'
import type { SandboxData, SandboxEmployee } from '@/lib/sandbox/types'

const READONLY_TOOLTIP = 'În demo, fișele se deschid doar din examinări.'

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Row {
  id: string
  firstName: string
  lastName: string
  companyEmployeeId: string | null
  jobTitle: string | null
  isActive: boolean
  archivedAt: string | null
  hasIdNumber: boolean
  company: { name: string } | null
  workplaceAssignments: Array<{ workplace: { id: string; name: string } }>
  examinations: Array<{ completedAt: string | null; signedAt: string | null; status: string }>
  recalls: Array<{ dueDate: string; status: string }>
}

export default function SandboxEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesInner />
    </Suspense>
  )
}

function EmployeesInner() {
  const { data } = useSandboxStore()
  const searchParams = useSearchParams()
  const recall = searchParams.get('recall') ?? ''
  const status = searchParams.get('status') ?? ''
  const wp = searchParams.get('wp') ?? ''
  const sort = searchParams.get('sort') ?? 'name_asc'

  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState('')

  const companyById = useMemo(() => new Map(data.companies.map((c) => [c.id, c])), [data])
  const workplaceById = useMemo(() => new Map(data.workplaces.map((w) => [w.id, w])), [data])

  // Build a serialized row per active employee, with their earliest open
  // recall and last examination, matching the real bulk table's input shape.
  const allRows = useMemo<Row[]>(() => {
    const examsByEmp = new Map<string, SandboxData['examinations']>()
    for (const e of data.examinations) {
      const arr = examsByEmp.get(e.employeeId) ?? []
      arr.push(e)
      examsByEmp.set(e.employeeId, arr)
    }
    const recallsByEmp = new Map<string, SandboxData['recalls']>()
    for (const r of data.recalls) {
      const arr = recallsByEmp.get(r.employeeId) ?? []
      arr.push(r)
      recallsByEmp.set(r.employeeId, arr)
    }

    return data.employees
      .filter((e) => e.archivedAt === null)
      .map((e: SandboxEmployee): Row => {
        const exams = (examsByEmp.get(e.id) ?? [])
          .filter((x) => x.status === 'completed')
          .sort(
            (a, b) =>
              (b.signedAt ?? b.completedAt ?? b.createdAt).getTime() -
              (a.signedAt ?? a.completedAt ?? a.createdAt).getTime()
          )
        const openRecall = (recallsByEmp.get(e.id) ?? [])
          .filter(
            (r) => r.status === 'pending' || r.status === 'scheduled' || r.status === 'overdue'
          )
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
        const wpRef = e.workplaceId ? workplaceById.get(e.workplaceId) : undefined
        return {
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          companyEmployeeId: null,
          jobTitle: e.jobTitle,
          isActive: true,
          archivedAt: null,
          hasIdNumber: !!e.cnp,
          company: e.companyId ? { name: companyById.get(e.companyId)?.name ?? '—' } : null,
          workplaceAssignments: wpRef ? [{ workplace: { id: wpRef.id, name: wpRef.name } }] : [],
          examinations: exams.map((x) => ({
            completedAt: x.completedAt ? x.completedAt.toISOString() : null,
            signedAt: x.signedAt ? x.signedAt.toISOString() : null,
            status: x.status,
          })),
          recalls: openRecall
            ? [{ dueDate: localYmd(openRecall.dueDate), status: openRecall.status }]
            : [],
        }
      })
  }, [data, companyById, workplaceById])

  // Overview counts — over the q+company-filtered active set, independent of
  // the overview dimension (so a tile's count matches its filtered list).
  const base = useMemo(() => {
    let list = allRows
    if (companyId)
      list = list.filter((r) => r.company && companyById.get(companyId)?.name === r.company.name)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((r) =>
        `${r.lastName} ${r.firstName} ${r.jobTitle ?? ''} ${r.company?.name ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
    }
    return list
  }, [allRows, companyId, q, companyById])

  const counts = useMemo<OverviewCounts>(() => {
    let overdue = 0
    let soon = 0
    let never = 0
    let noWorkplace = 0
    let missingData = 0
    for (const r of base) {
      const s = computeEmployeeStatus({
        recall: r.recalls[0] ?? null,
        hasExam: r.examinations.length > 0,
      })
      if (s.kind === 'overdue') overdue++
      if (s.kind === 'soon') soon++
      if (r.examinations.length === 0) never++
      if (r.workplaceAssignments.length === 0) noWorkplace++
      if (!r.jobTitle || !r.hasIdNumber) missingData++
    }
    return { activi: base.length, overdue, soon, never, noWorkplace, missingData }
  }, [base])

  // Apply the active overview dimension + sort.
  const rows = useMemo(() => {
    let list = base
    if (recall === 'overdue' || recall === 'soon') {
      list = list.filter(
        (r) =>
          computeEmployeeStatus({
            recall: r.recalls[0] ?? null,
            hasExam: r.examinations.length > 0,
          }).kind === recall
      )
    }
    if (status === 'never') list = list.filter((r) => r.examinations.length === 0)
    if (status === 'missing_data') list = list.filter((r) => !r.jobTitle || !r.hasIdNumber)
    if (wp === 'no_workplace') list = list.filter((r) => r.workplaceAssignments.length === 0)

    const dir = sort.endsWith('_desc') ? -1 : 1
    const by = sort.replace(/_(asc|desc)$/, '')
    return list.slice().sort((a, b) => {
      let cmp = 0
      if (by === 'company') cmp = (a.company?.name ?? '').localeCompare(b.company?.name ?? '')
      else if (by === 'jobTitle') cmp = (a.jobTitle ?? '').localeCompare(b.jobTitle ?? '')
      else if (by === 'workplace')
        cmp = (a.workplaceAssignments[0]?.workplace.name ?? '').localeCompare(
          b.workplaceAssignments[0]?.workplace.name ?? ''
        )
      else if (by === 'recall')
        cmp = (a.recalls[0]?.dueDate ?? '9999').localeCompare(b.recalls[0]?.dueDate ?? '9999')
      else cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
      return cmp * dir
    })
  }, [base, recall, status, wp, sort])

  const workplaceOptions = useMemo(
    () =>
      data.workplaces.map((w) => ({
        id: w.id,
        name: w.name,
        company: { name: companyById.get(w.companyId)?.name ?? '—' },
      })),
    [data, companyById]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
          {t('employees.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('employees.subtitle')}</p>
      </div>

      <EmployeeOverviewStrip
        counts={counts}
        recall={recall}
        status={status}
        wp={wp}
        labels={{
          activi: t('employees.overview.activi'),
          overdue: t('employees.overview.overdue'),
          soon: t('employees.overview.soon'),
          never: t('employees.overview.never'),
          noWorkplace: t('employees.overview.noWorkplace'),
          missingData: t('employees.overview.missingData'),
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('employees.search.placeholder')}
          className="h-9 rounded-md border px-3 text-sm bg-background w-full sm:w-72"
        />
        <FilterChip label="Companie" value={companyId} onClear={() => setCompanyId('')}>
          <select
            className="chip-select"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Companie</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterChip>
      </div>

      <EmployeesBulkTable
        employees={rows}
        workplaces={workplaceOptions}
        locale="ro"
        sort={sort}
        showArchived={false}
        canWrite={false}
        readOnly
        readOnlyTooltip={READONLY_TOOLTIP}
        labels={{
          overdue: t('employees.statusCol.overdue'),
          soon: t('employees.statusCol.soon'),
          ok: t('employees.statusCol.ok'),
          never: t('employees.statusCol.never'),
          none: t('employees.statusCol.none'),
          funcMissing: t('employees.statusCol.funcMissing'),
          cnpMissing: t('employees.statusCol.cnpMissing'),
          newExam: t('employees.statusCol.newExam'),
          lastExam: t('employees.statusCol.lastExam'),
          due: t('employees.statusCol.due'),
        }}
      />
    </div>
  )
}

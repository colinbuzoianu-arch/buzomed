'use client'

import { Activity, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { FilterChip } from '@/components/examinations/filter-chip'
import { Button } from '@/components/ui/button'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { formatDate } from '@/lib/format-date'
import { sandboxT as t } from '@/lib/sandbox/i18n'
import { useSandboxStore } from '@/lib/sandbox/store'
import type { SandboxData, SandboxExamination } from '@/lib/sandbox/types'

type Tab = 'scadente' | 'programate' | 'in_curs' | 'finalizate' | 'avize' | 'toate'
const VALID_TABS: Tab[] = ['scadente', 'programate', 'in_curs', 'finalizate', 'avize', 'toate']

function statusForTab(tab: Tab): SandboxExamination['status'] | null {
  if (tab === 'programate') return 'scheduled'
  if (tab === 'in_curs') return 'in_progress'
  if (tab === 'finalizate') return 'completed'
  return null
}

function examMatchesTab(e: SandboxExamination, tab: Tab): boolean {
  if (tab === 'avize') return e.signedAt !== null && e.verdict !== null
  if (tab === 'toate') return true
  const s = statusForTab(tab)
  return s ? e.status === s : false
}

export default function SandboxExaminationsPage() {
  // useSearchParams needs a Suspense boundary to avoid a prerender bailout.
  return (
    <Suspense fallback={null}>
      <ExaminationsListInner />
    </Suspense>
  )
}

function ExaminationsListInner() {
  const { data } = useSandboxStore()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = (VALID_TABS as string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'scadente'

  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [verdict, setVerdict] = useState('')

  const companyById = useMemo(() => new Map(data.companies.map((c) => [c.id, c])), [data])
  const employeeById = useMemo(() => new Map(data.employees.map((e) => [e.id, e])), [data])
  const workplaceById = useMemo(() => new Map(data.workplaces.map((w) => [w.id, w])), [data])
  const typeById = useMemo(() => new Map(data.examinationTypes.map((x) => [x.id, x])), [data])

  const counts = useMemo(() => countTabs(data), [data])

  // The live, in-progress examination — the "see what happens during an exam"
  // entry point. Surfaced as a prominent CTA so demo visitors don't have to
  // discover the „În curs" tab first.
  const inProgress = useMemo(
    () => data.examinations.find((e) => e.status === 'in_progress'),
    [data]
  )
  const inProgressEmployee = inProgress ? employeeById.get(inProgress.employeeId) : undefined
  const inProgressType = inProgress ? typeById.get(inProgress.examinationTypeId) : undefined

  const rows = useMemo(() => {
    let list = data.examinations.filter((e) => examMatchesTab(e, tab))
    if (companyId) list = list.filter((e) => e.companyId === companyId)
    if (typeId) list = list.filter((e) => e.examinationTypeId === typeId)
    if (verdict) list = list.filter((e) => e.verdict === verdict)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((e) => {
        const emp = employeeById.get(e.employeeId)
        return emp ? `${emp.lastName} ${emp.firstName}`.toLowerCase().includes(q) : false
      })
    }
    return list
      .slice()
      .sort((a, b) => dateFor(b).getTime() - dateFor(a).getTime())
      .slice(0, 60)
  }, [data, tab, companyId, typeId, verdict, search, employeeById])

  const recalls = useMemo(() => {
    let list = data.recalls.filter(
      (r) => r.status === 'pending' || r.status === 'overdue' || r.status === 'scheduled'
    )
    if (companyId) list = list.filter((r) => r.companyId === companyId)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((r) => {
        const emp = employeeById.get(r.employeeId)
        return emp ? `${emp.lastName} ${emp.firstName}`.toLowerCase().includes(q) : false
      })
    }
    return list
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 60)
  }, [data, companyId, search, employeeById])

  const tabs: Array<{ key: Tab; label: string; count: number; overdue?: number }> = [
    {
      key: 'scadente',
      label: t('examinations.tabs.scadente'),
      count: counts.scadente,
      overdue: counts.overdue,
    },
    { key: 'programate', label: t('examinations.tabs.scheduled'), count: counts.scheduled },
    { key: 'in_curs', label: t('examinations.tabs.in_progress'), count: counts.in_progress },
    { key: 'finalizate', label: t('examinations.tabs.completed'), count: counts.completed },
    { key: 'avize', label: t('examinations.tabs.avize'), count: counts.avize },
    { key: 'toate', label: t('examinations.tabs.all'), count: counts.total },
  ]

  const showVerdictFilter = tab === 'finalizate' || tab === 'avize' || tab === 'toate'
  const anyFilter = search || companyId || typeId || verdict
  function clearAll() {
    setSearch('')
    setCompanyId('')
    setTypeId('')
    setVerdict('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
            {t('examinations.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('examinations.subtitle')}
          </p>
        </div>
        <Button asChild>
          <Link href="/sandbox/examinations/new">+ {t('examinations.newButton')}</Link>
        </Button>
      </div>

      {/* Live examination CTA — the "see what an examination looks like" entry
          point. Prominent so demo visitors go straight into the stepper
          instead of having to discover the „În curs" tab first. */}
      {inProgress && (
        <Link
          href={`/sandbox/examinations/${inProgress.id}`}
          className="group flex items-center gap-4 rounded-xl border-2 border-primary/50 bg-primary/5 px-5 py-4 transition-colors hover:border-primary hover:bg-primary/10"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Activity className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-emerald-500 ring-2 ring-background" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold text-primary">Examinare în curs</span>
            <span className="block truncate text-sm text-muted-foreground">
              {inProgressEmployee
                ? `${inProgressEmployee.lastName} ${inProgressEmployee.firstName}`
                : ''}
              {inProgressType ? ` · ${inProgressType.nameRo}` : ''} — vezi cum decurge o examinare
              pas cu pas
            </span>
          </span>
          <ChevronRight className="h-6 w-6 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      <div className="flex gap-2 text-sm flex-wrap">
        {tabs.map((entry) => {
          const active = tab === entry.key
          const isScadenteOverdue = entry.key === 'scadente' && (entry.overdue ?? 0) > 0
          return (
            <Link
              key={entry.key}
              href={`/sandbox/examinations?tab=${entry.key}`}
              className={`px-3 py-1 rounded-md border inline-flex items-center gap-1.5 ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              } ${isScadenteOverdue ? 'border-destructive' : ''}`}
            >
              <span>{entry.label}</span>
              <span className="text-muted-foreground">({entry.count})</span>
              {isScadenteOverdue && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium">
                  {entry.overdue}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('examinations.filters.searchPlaceholder')}
          className="h-9 rounded-md border px-3 text-sm bg-background w-full sm:w-64"
        />
        <FilterChip
          label={t('examinations.filters.company')}
          value={companyId}
          onClear={() => setCompanyId('')}
        >
          <select
            className="chip-select"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">{t('examinations.filters.company')}</option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterChip>
        <FilterChip
          label={t('examinations.filters.type')}
          value={typeId}
          onClear={() => setTypeId('')}
        >
          <select
            className="chip-select"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">{t('examinations.filters.type')}</option>
            {data.examinationTypes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nameRo}
              </option>
            ))}
          </select>
        </FilterChip>
        {showVerdictFilter && (
          <FilterChip
            label={t('examinations.filters.verdict')}
            value={verdict}
            onClear={() => setVerdict('')}
          >
            <select
              className="chip-select"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
            >
              <option value="">{t('examinations.filters.verdict')}</option>
              <option value="apt">{t('examinations.filters.verdicts.apt')}</option>
              <option value="apt_conditionat">
                {t('examinations.filters.verdicts.apt_conditionat')}
              </option>
              <option value="inapt_temporar">
                {t('examinations.filters.verdicts.inapt_temporar')}
              </option>
              <option value="inapt">{t('examinations.filters.verdicts.inapt')}</option>
            </select>
          </FilterChip>
        )}
        {anyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            {t('examinations.filters.clearAll')}
          </button>
        )}
      </div>

      {/* Content */}
      {tab === 'scadente' ? (
        <RecallList
          recalls={recalls}
          employeeById={employeeById}
          companyById={companyById}
          now={data.now}
        />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">
          {t('examinations.filters.noMatches')}
        </p>
      ) : (
        <div className="border rounded-lg divide-y">
          {rows.map((e) => {
            const emp = employeeById.get(e.employeeId)
            const company = companyById.get(e.companyId)
            const wp = workplaceById.get(e.workplaceId)
            const type = typeById.get(e.examinationTypeId)
            return (
              <Link
                key={e.id}
                href={`/sandbox/examinations/${e.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  #{e.examinationNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {emp ? `${emp.lastName} ${emp.firstName}` : '—'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {company?.name}
                    {wp ? ` · ${wp.name}` : ''} · {type?.nameRo}
                  </span>
                </span>
                <span className="hidden sm:block shrink-0 text-xs text-muted-foreground tabular-nums w-24 text-right">
                  {formatDate(dateFor(e), 'short', 'ro')}
                </span>
                {(tab === 'finalizate' || tab === 'avize' || tab === 'toate') && e.verdict ? (
                  <span className="hidden md:block shrink-0">
                    <VerdictBadge verdict={e.verdict} />
                  </span>
                ) : null}
                <span className="shrink-0">
                  <ExaminationStatusBadge
                    status={e.status}
                    scheduledAt={e.scheduledAt}
                    startedAt={e.startedAt}
                    completedAt={e.completedAt}
                    signedAt={e.signedAt}
                    locale="ro"
                  />
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function dateFor(e: SandboxExamination): Date {
  return e.signedAt ?? e.completedAt ?? e.scheduledAt ?? e.createdAt
}

function countTabs(data: SandboxData) {
  const scheduled = data.examinations.filter((e) => e.status === 'scheduled').length
  const in_progress = data.examinations.filter((e) => e.status === 'in_progress').length
  const completed = data.examinations.filter((e) => e.status === 'completed').length
  const avize = data.examinations.filter((e) => e.signedAt !== null && e.verdict !== null).length
  const total = data.examinations.length
  const scadenteList = data.recalls.filter((r) => r.status === 'pending' || r.status === 'overdue')
  return {
    scheduled,
    in_progress,
    completed,
    avize,
    total,
    scadente: scadenteList.length,
    overdue: data.recalls.filter((r) => r.status === 'overdue').length,
  }
}

function RecallList({
  recalls,
  employeeById,
  companyById,
  now,
}: {
  recalls: import('@/lib/sandbox/types').SandboxRecall[]
  employeeById: Map<string, import('@/lib/sandbox/types').SandboxEmployee>
  companyById: Map<string, import('@/lib/sandbox/types').SandboxCompany>
  now: Date
}) {
  if (recalls.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center">{t('dashboard.controls.emptySoon')}</p>
    )
  }
  const startMs = new Date(now).setHours(0, 0, 0, 0)
  return (
    <div className="border rounded-lg divide-y">
      {recalls.map((r) => {
        const emp = employeeById.get(r.employeeId)
        const company = companyById.get(r.companyId)
        const days = Math.round((new Date(r.dueDate).setHours(0, 0, 0, 0) - startMs) / 86_400_000)
        const overdue = days < 0
        return (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {emp ? `${emp.lastName} ${emp.firstName}` : '—'}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {company?.name} · {formatDate(r.dueDate, 'short', 'ro')}
              </span>
            </span>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                overdue
                  ? 'text-destructive border-destructive/30 bg-destructive/5'
                  : days === 0
                    ? 'text-amber-700 border-amber-200 bg-amber-50/60'
                    : 'text-muted-foreground border-border'
              }`}
            >
              {overdue
                ? t('dashboard.controls.daysOverdue').replace('{n}', String(-days))
                : days === 0
                  ? t('dashboard.controls.dueToday')
                  : t('dashboard.controls.daysLeft').replace('{n}', String(days))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

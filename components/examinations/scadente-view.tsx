import type { RecallStatus } from '@prisma/client'
import Link from 'next/link'
import { BulkScheduleButton } from '@/app/(authenticated)/recalls/bulk-schedule-modal'
import { RecallActions } from '@/app/(authenticated)/recalls/recall-actions'
import { Pagination } from '@/components/ui/pagination'
import { getHorizonRange, type Horizon, VALID_HORIZONS } from '@/lib/examinations/horizon'
import { formatDate } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'

const EXAMINATIONS_PATH = '/examinations'
const SCADENTE_PAGE_SIZE = 100

// ─── Priority scoring helpers ─────────────────────────────────────────

function getHazardMultiplier(riskProfileJson: unknown): number {
  const profile = parseRiskProfile(riskProfileJson)
  let hasHigh = false
  let hasMedium = false
  let hasAny = false
  for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
    for (const hazard of hazards) {
      const entry = (profile[category] as Record<string, { present: boolean; severity?: string }>)[
        hazard
      ]
      if (entry?.present) {
        hasAny = true
        if (entry.severity === 'high') hasHigh = true
        else if (entry.severity === 'medium') hasMedium = true
      }
    }
  }
  if (hasHigh) return 3
  if (hasMedium) return 2
  if (hasAny) return 1.5
  return 1
}

function recallPriorityBadge(
  daysOverdue: number,
  multiplier: number
): { label: string; className: string } | null {
  if (daysOverdue <= 0) {
    if (multiplier >= 3)
      return { label: 'Risc ↑', className: 'text-blue-700 bg-blue-50 border-blue-200' }
    return null
  }
  const score = daysOverdue * multiplier
  if (score >= 30) return { label: 'Critică', className: 'text-red-700 bg-red-50 border-red-200' }
  if (score >= 10)
    return { label: 'Ridicată', className: 'text-orange-700 bg-orange-50 border-orange-200' }
  if (score >= 3)
    return { label: 'Medie', className: 'text-amber-700 bg-amber-50 border-amber-200' }
  return { label: 'Scăzută', className: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
}

// ─── Scadențe view ────────────────────────────────────────────────────

export default async function ScadenteView(props: {
  tenantId: string
  locale: 'ro' | 'en'
  horizon: Horizon
  companyIdFilter: string | null
  canWrite: boolean
  isPractitioner: boolean
  userId: string
  today: Date
  t: (k: string) => string
  page: number
  searchParams: Record<string, string | undefined>
}) {
  const range = getHorizonRange(props.horizon)
  const statusFilter =
    props.horizon === 'overdue'
      ? { status: 'overdue' as const }
      : { status: { in: ['pending', 'overdue'] as RecallStatus[] } }

  // Archived-employee exclusion pushed into the where clause (was previously
  // a post-fetch .filter()) — required for the skip/take below to paginate
  // correctly; filtering after the fact would undercount later pages.
  const recallsWhere = {
    tenantId: props.tenantId,
    deletedAt: null,
    ...statusFilter,
    ...(range.from ? { dueDate: { gte: range.from } } : {}),
    ...(range.to
      ? props.horizon === 'overdue'
        ? { dueDate: { lt: range.to } }
        : { dueDate: { lte: range.to } }
      : {}),
    ...(props.companyIdFilter
      ? {
          workplace: {
            companyId: props.companyIdFilter,
            deletedAt: null,
          },
        }
      : {}),
    employee: { archivedAt: null },
    OR: [{ createdFromExaminationId: null }, { createdFromExamination: { deletedAt: null } }],
  }

  const [recalls, recallsTotal, horizonRecalls, companies, practitioners] = await Promise.all([
    prisma.recall.findMany({
      where: recallsWhere,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      skip: (props.page - 1) * SCADENTE_PAGE_SIZE,
      take: SCADENTE_PAGE_SIZE,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            archivedAt: true,
          },
        },
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            riskProfile: true,
            company: { select: { id: true, name: true } },
          },
        },
        examinationType: { select: { nameRo: true, nameEn: true } },
      },
    }),
    prisma.recall.count({ where: recallsWhere }),
    // Horizon tab counts are tenant-wide (never company-filtered, unlike
    // `recalls` above) — fetch the pending+overdue set once and bucket by
    // horizon in memory, instead of one round trip per horizon. This set
    // is bounded by active employee count (current/near-future
    // obligations), not by historical volume like examinations, so it
    // doesn't grow unboundedly over time the same way — the `take` here
    // is defense-in-depth, not an expected-to-be-hit ceiling.
    prisma.recall.findMany({
      where: {
        tenantId: props.tenantId,
        deletedAt: null,
        status: { in: ['pending', 'overdue'] as RecallStatus[] },
        OR: [{ createdFromExaminationId: null }, { createdFromExamination: { deletedAt: null } }],
      },
      select: { status: true, dueDate: true },
      take: 5000,
    }),
    prisma.company.findMany({
      where: { tenantId: props.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId: props.tenantId,
        isActive: true,
        deletedAt: null,
        roles: { hasSome: ['practitioner', 'practice_admin'] },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        professionalTitle: true,
      },
    }),
  ])

  // Archived-employee exclusion now happens in recallsWhere above — recalls
  // is already the visible set. Priority-sorted within this page only (a
  // true cross-page hazard-priority sort would need a computed/indexed
  // column; DB orderBy above already puts overdue-first, due-date-ascending).
  const visibleRecalls = recalls
  visibleRecalls.sort((a, b) => {
    const aOverdue = a.status === 'overdue'
    const bOverdue = b.status === 'overdue'
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (aOverdue) {
      const todayMs = props.today.getTime()
      const aScore =
        Math.round((todayMs - a.dueDate.getTime()) / 86_400_000) *
        getHazardMultiplier(a.workplace.riskProfile)
      const bScore =
        Math.round((todayMs - b.dueDate.getTime()) / 86_400_000) *
        getHazardMultiplier(b.workplace.riskProfile)
      if (bScore !== aScore) return bScore - aScore
    }
    return a.dueDate.getTime() - b.dueDate.getTime()
  })
  const countsMap = Object.fromEntries(
    VALID_HORIZONS.map((h) => {
      const r = getHorizonRange(h)
      const count = horizonRecalls.filter((rec) => {
        if (h === 'overdue' && rec.status !== 'overdue') return false
        if (r.from && rec.dueDate < r.from) return false
        if (r.to) {
          if (h === 'overdue') {
            if (!(rec.dueDate < r.to)) return false
          } else if (!(rec.dueDate <= r.to)) {
            return false
          }
        }
        return true
      }).length
      return [h, count] as const
    })
  )

  // Group visible recalls by company for the overview cards
  type CompanyEntry = {
    company: { id: string; name: string }
    overdue: number
    total: number
  }
  const recallByCompanyMap = new Map<string, CompanyEntry>()
  for (const r of visibleRecalls) {
    const cid = r.workplace.company.id
    if (!recallByCompanyMap.has(cid)) {
      recallByCompanyMap.set(cid, { company: r.workplace.company, overdue: 0, total: 0 })
    }
    const entry = recallByCompanyMap.get(cid)!
    entry.total++
    if (r.status === 'overdue') entry.overdue++
  }
  const companySummary = Array.from(recallByCompanyMap.values()).sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue
    return b.total - a.total
  })

  const t = props.t

  const recallActionLabels = {
    colWorker: t('recalls.colWorker'),
    colCompany: t('recalls.colCompany'),
    colWorkplace: t('recalls.colWorkplace'),
    colExamType: t('recalls.colExamType'),
    colDueDate: t('recalls.colDueDate'),
    colDaysUntil: t('recalls.colDaysUntil'),
    colActions: t('recalls.colActions'),
    statusOverdue: t('recalls.statusOverdue'),
    daysOverdue: t('recalls.daysOverdue'),
    daysUntilDue: t('recalls.daysUntilDue'),
    dueToday: t('recalls.dueToday'),
    scheduleButton: t('recalls.scheduleButton'),
    cancelButton: t('recalls.cancelButton'),
    scheduling: t('recalls.scheduling'),
    cancelling: t('recalls.cancelling'),
    scheduleDialogTitle: t('recalls.scheduleDialogTitle'),
    schedulePractitioner: t('recalls.schedulePractitioner'),
    scheduleAt: t('recalls.scheduleAt'),
    scheduleAtHelp: t('recalls.scheduleAtHelp'),
    submitSchedule: t('recalls.submitSchedule'),
    cancelDialogTitle: t('recalls.cancelDialogTitle'),
    cancelReasonLabel: t('recalls.cancelReasonLabel'),
    cancelReasonPlaceholder: t('recalls.cancelReasonPlaceholder'),
    submitCancel: t('recalls.submitCancel'),
    cancelDialog: t('common.cancel'),
    errorMessage: t('recalls.errorMessage'),
  }

  const horizonTabs: Array<{
    h: Horizon
    label: string
    destructive?: boolean
  }> = [
    {
      h: 'overdue',
      label: t('recalls.tabs.overdue'),
      destructive: true,
    },
    { h: 'thisWeek', label: t('recalls.tabs.thisWeek') },
    { h: 'thisMonth', label: t('recalls.tabs.thisMonth') },
    { h: 'next3Months', label: t('recalls.tabs.next3Months') },
    { h: 'all', label: t('recalls.tabs.all') },
  ]

  const totalPages = Math.ceil(recallsTotal / SCADENTE_PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Horizon sub-tabs */}
      <div className="flex gap-2 text-sm flex-wrap">
        {horizonTabs.map((sub) => {
          const active = props.horizon === sub.h
          const count = countsMap[sub.h] ?? 0
          const href = props.companyIdFilter
            ? `/examinations?tab=scadente&horizon=${sub.h}&companyId=${props.companyIdFilter}`
            : `/examinations?tab=scadente&horizon=${sub.h}`
          return (
            <Link
              key={sub.h}
              href={href}
              className={`px-3 py-1 rounded-md border ${
                active ? 'bg-secondary font-medium' : 'hover:bg-muted'
              } ${sub.destructive && count > 0 ? 'border-destructive text-destructive' : ''}`}
            >
              {sub.label}{' '}
              <span
                className={sub.destructive && count > 0 ? 'font-semibold' : 'text-muted-foreground'}
              >
                ({count})
              </span>
            </Link>
          )
        })}
      </div>

      {/* Company overview cards — shown when multiple companies have recalls in this horizon */}
      {!props.companyIdFilter && companySummary.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companySummary.map(({ company, overdue, total }) => (
            <div
              key={company.id}
              className={`border rounded-lg p-3 space-y-2 ${overdue > 0 ? 'border-destructive/40 bg-destructive/5' : ''}`}
            >
              <div className="font-medium text-sm truncate">{company.name}</div>
              <div className="flex gap-3 text-xs">
                {overdue > 0 && (
                  <span className="text-destructive font-medium">
                    {t('recalls.companyOverdueCount').replace('{count}', String(overdue))}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {t('recalls.companyTotalCount').replace('{count}', String(total))}
                </span>
              </div>
              <a
                href={`/examinations?tab=scadente&horizon=${props.horizon}&companyId=${company.id}`}
                className="inline-block text-xs text-primary hover:underline"
              >
                {t('recalls.batchButton').replace('({count})', '').trim()} →
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Quick bulk-schedule modal — shown when a company filter is active */}
      {props.companyIdFilter && props.canWrite && visibleRecalls.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {visibleRecalls.length} {t('recalls.companyTotalCount').replace('{count}', '').trim()}
          </span>
          <BulkScheduleButton
            recalls={visibleRecalls.map((r) => ({
              id: r.id,
              employeeName: `${r.employee.lastName} ${r.employee.firstName}`,
              workplaceName: r.workplace.name,
              examTypeName:
                props.locale === 'en'
                  ? (r.examinationType.nameEn ?? r.examinationType.nameRo)
                  : r.examinationType.nameRo,
              dueDate: r.dueDate.toISOString(),
            }))}
            practitioners={practitioners.map((p) => ({
              id: p.id,
              label: `${p.lastName} ${p.firstName}${p.professionalTitle ? ` (${p.professionalTitle})` : ''}`,
            }))}
            companyName={companies.find((c) => c.id === props.companyIdFilter)?.name ?? ''}
            defaultPractitionerId={props.isPractitioner ? props.userId : undefined}
            labels={{
              batchButton: t('recalls.batchButton'),
              batchModalTitle: t('recalls.batchModalTitle'),
              batchModalSubtitle: t('recalls.batchModalSubtitle'),
              batchPractitioner: t('recalls.batchPractitioner'),
              batchStartDate: t('recalls.batchStartDate'),
              batchStartTime: t('recalls.batchStartTime'),
              batchStartTimeHelp: t('recalls.batchStartTimeHelp'),
              batchPreviewTitle: t('recalls.batchPreviewTitle'),
              batchColWorker: t('recalls.colWorker'),
              batchColWorkplace: t('recalls.colWorkplace'),
              batchColExamType: t('recalls.colExamType'),
              batchColTime: t('recalls.batchColTime'),
              batchSubmit: t('recalls.batchSubmit'),
              batchSubmitting: t('recalls.batchSubmitting'),
              batchCancel: t('recalls.batchCancel'),
              batchError: t('recalls.errorMessage'),
            }}
          />
        </div>
      )}

      {/* Company filter */}
      {companies.length > 0 && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">{t('recalls.filterCompany')}:</span>
          <Link
            href={`/examinations?tab=scadente&horizon=${props.horizon}`}
            className={`px-2 py-0.5 rounded border ${
              !props.companyIdFilter ? 'bg-secondary' : 'hover:bg-muted'
            }`}
          >
            {t('recalls.allCompanies')}
          </Link>
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/examinations?tab=scadente&horizon=${props.horizon}&companyId=${c.id}`}
              className={`px-2 py-0.5 rounded border ${
                props.companyIdFilter === c.id ? 'bg-secondary' : 'hover:bg-muted'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {visibleRecalls.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {props.horizon === 'overdue' ? t('recalls.emptyOverdue') : t('recalls.empty')}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('recalls.colWorker')}</th>
                  <th className="text-left px-4 py-2">{t('recalls.colCompany')}</th>
                  <th className="text-left px-4 py-2">{t('recalls.colWorkplace')}</th>
                  <th className="text-left px-4 py-2">{t('recalls.colExamType')}</th>
                  <th className="text-left px-4 py-2">{t('recalls.colDueDate')}</th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">
                    {t('recalls.colDaysUntil')}
                  </th>
                  <th className="text-left px-4 py-2">Prioritate</th>
                  {props.canWrite && (
                    <th className="text-right px-4 py-2">{t('recalls.colActions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRecalls.map((r) => {
                  const due = new Date(r.dueDate)
                  const days = Math.round(
                    (due.getTime() - props.today.getTime()) / (1000 * 60 * 60 * 24)
                  )
                  const isOverdue = r.status === 'overdue'
                  return (
                    <tr key={r.id} className={isOverdue ? 'bg-destructive/5' : undefined}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/employees/${r.employee.id}`}
                          className="hover:underline font-medium"
                        >
                          {r.employee.lastName} {r.employee.firstName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/companies/${r.workplace.company.id}`}
                          className="hover:underline"
                        >
                          {r.workplace.company.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.workplace.name}
                        {r.workplace.department && (
                          <span className="text-xs"> — {r.workplace.department}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {props.locale === 'en'
                          ? (r.examinationType.nameEn ?? r.examinationType.nameRo)
                          : r.examinationType.nameRo}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(due, 'medium', props.locale === 'ro' ? 'ro' : 'en')}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap ${
                          isOverdue ? 'text-destructive font-medium' : ''
                        }`}
                      >
                        {days === 0
                          ? t('recalls.dueToday')
                          : days < 0
                            ? t('recalls.daysOverdue').replace('{days}', String(-days))
                            : t('recalls.daysUntilDue').replace('{days}', String(days))}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const badge = recallPriorityBadge(
                            isOverdue ? Math.abs(days) : 0,
                            getHazardMultiplier(r.workplace.riskProfile)
                          )
                          return badge ? (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ) : null
                        })()}
                      </td>
                      {props.canWrite && (
                        <td className="px-4 py-3 text-right">
                          <RecallActions
                            recallId={r.id}
                            employeeName={`${r.employee.lastName} ${r.employee.firstName}`}
                            practitioners={practitioners.map((p) => ({
                              id: p.id,
                              label: `${p.lastName} ${p.firstName}${
                                p.professionalTitle ? ` (${p.professionalTitle})` : ''
                              }`,
                            }))}
                            defaultPractitionerId={props.isPractitioner ? props.userId : undefined}
                            labels={recallActionLabels}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {visibleRecalls.map((r) => {
              const due = new Date(r.dueDate)
              const days = Math.round(
                (due.getTime() - props.today.getTime()) / (1000 * 60 * 60 * 24)
              )
              const isOverdue = r.status === 'overdue'
              return (
                <div
                  key={r.id}
                  className={`border rounded-lg p-3 space-y-2 ${isOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Link
                        href={`/employees/${r.employee.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.employee.lastName} {r.employee.firstName}
                      </Link>
                      {(() => {
                        const badge = recallPriorityBadge(
                          isOverdue ? Math.abs(days) : 0,
                          getHazardMultiplier(r.workplace.riskProfile)
                        )
                        return badge ? (
                          <span
                            className={`text-[10px] font-semibold px-1 py-0.5 rounded border flex-shrink-0 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        ) : null
                      })()}
                    </div>
                    <span
                      className={`text-sm font-semibold whitespace-nowrap tabular-nums flex-shrink-0 ${
                        isOverdue
                          ? 'text-destructive'
                          : days <= 7
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {days === 0
                        ? t('recalls.dueToday')
                        : days < 0
                          ? t('recalls.daysOverdue').replace('{days}', String(-days))
                          : t('recalls.daysUntilDue').replace('{days}', String(days))}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <Link
                        href={`/companies/${r.workplace.company.id}`}
                        className="hover:underline"
                      >
                        {r.workplace.company.name}
                      </Link>
                      {' · '}
                      {r.workplace.name}
                      {r.workplace.department && ` — ${r.workplace.department}`}
                    </div>
                    <div>
                      {props.locale === 'en'
                        ? (r.examinationType.nameEn ?? r.examinationType.nameRo)
                        : r.examinationType.nameRo}
                    </div>
                    <div className={isOverdue ? 'text-destructive font-medium' : ''}>
                      {formatDate(due, 'medium', props.locale === 'ro' ? 'ro' : 'en')}
                    </div>
                  </div>
                  {props.canWrite && (
                    <div className="pt-1">
                      <RecallActions
                        recallId={r.id}
                        employeeName={`${r.employee.lastName} ${r.employee.firstName}`}
                        practitioners={practitioners.map((p) => ({
                          id: p.id,
                          label: `${p.lastName} ${p.firstName}${
                            p.professionalTitle ? ` (${p.professionalTitle})` : ''
                          }`,
                        }))}
                        defaultPractitionerId={props.isPractitioner ? props.userId : undefined}
                        labels={recallActionLabels}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <Pagination
        href={EXAMINATIONS_PATH}
        params={props.searchParams}
        paramName="page"
        page={props.page}
        totalPages={totalPages}
      />
    </div>
  )
}

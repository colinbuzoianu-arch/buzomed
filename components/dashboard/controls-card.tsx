import type { RecallStatus } from '@prisma/client'
import type { Translator } from '@/lib/i18n'
import { formatDate } from '@/lib/format-date'
import { bucharestDayBounds } from '@/lib/time/bucharest'
import { prisma } from '@/lib/prisma'
import { ControlsCardClient, type ControlRow } from './controls-card-client'

/**
 * „Controale" — named recall lists for the two actionable buckets.
 *
 *   - Depășite        → status 'overdue' (matches the dashboard alert count,
 *                       which also counts status 'overdue' only).
 *   - Expiră în 30 zile → pending/scheduled due within 30 Bucharest-days.
 *
 * Both reuse the standard "source exam not soft-deleted" guard used by every
 * other recall count so the numbers line up with the Scadențe page.
 */

const MAX_ROWS = 8

// Shared guard: a recall whose source examination was soft-deleted is stale.
const notDeletedSource = {
  OR: [{ createdFromExaminationId: null }, { createdFromExamination: { deletedAt: null } }],
}

export default async function ControlsCard({
  tenantId,
  locale,
  t,
}: {
  tenantId: string
  locale: 'ro' | 'en'
  t: Translator
}) {
  const { start } = bucharestDayBounds()
  const in30 = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)

  const overdueWhere = {
    tenantId,
    deletedAt: null,
    status: 'overdue' as RecallStatus,
    employee: { archivedAt: null },
    ...notDeletedSource,
  }
  const soonWhere = {
    tenantId,
    deletedAt: null,
    status: { in: ['pending', 'scheduled'] as RecallStatus[] },
    dueDate: { gte: start, lte: in30 },
    employee: { archivedAt: null },
    ...notDeletedSource,
  }

  const rowSelect = {
    id: true,
    dueDate: true,
    employee: { select: { id: true, firstName: true, lastName: true } },
    workplace: { select: { company: { select: { name: true } } } },
  }

  const [overdueRows, overdueCount, soonRows, soonCount] = await Promise.all([
    prisma.recall.findMany({
      where: overdueWhere,
      orderBy: { dueDate: 'asc' },
      take: MAX_ROWS,
      select: rowSelect,
    }),
    prisma.recall.count({ where: overdueWhere }),
    prisma.recall.findMany({
      where: soonWhere,
      orderBy: { dueDate: 'asc' },
      take: MAX_ROWS,
      select: rowSelect,
    }),
    prisma.recall.count({ where: soonWhere }),
  ])

  const startMs = start.getTime()
  const dayMs = 86_400_000
  const toRow = (r: (typeof overdueRows)[number]): ControlRow => ({
    id: r.id,
    employeeId: r.employee.id,
    name: `${r.employee.lastName} ${r.employee.firstName}`,
    company: r.workplace.company.name,
    dueDateLabel: formatDate(r.dueDate, 'short', locale),
    days: Math.round((new Date(r.dueDate).getTime() - startMs) / dayMs),
  })

  return (
    <ControlsCardClient
      overdue={overdueRows.map(toRow)}
      soon={soonRows.map(toRow)}
      overdueCount={overdueCount}
      soonCount={soonCount}
      labels={{
        title: t('dashboard.controls.title'),
        tabOverdue: t('dashboard.controls.tabOverdue'),
        tabSoon: t('dashboard.controls.tabSoon'),
        viewAll: t('dashboard.controls.viewAll'),
        emptyOverdue: t('dashboard.controls.emptyOverdue'),
        emptySoon: t('dashboard.controls.emptySoon'),
        daysOverdue: t('dashboard.controls.daysOverdue'),
        daysLeft: t('dashboard.controls.daysLeft'),
        dueToday: t('dashboard.controls.dueToday'),
      }}
    />
  )
}

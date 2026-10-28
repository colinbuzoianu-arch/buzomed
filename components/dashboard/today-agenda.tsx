import type { ExaminationStatus } from '@prisma/client'
import type { Translator } from '@/lib/i18n'
import { prisma } from '@/lib/prisma'
import { bucharestDayBounds } from '@/lib/time/bucharest'
import { type AgendaViewRow, TodayAgendaView } from './today-agenda-view'

/**
 * „Programări azi" — the day's appointments, by name, not just a count.
 *
 * Today is the Bucharest civil day (see lib/time/bucharest): an exam at 23:30
 * local time belongs to today even though it is the previous day in UTC.
 * Scope: scheduled + in_progress, ordered by time, max 12 rows.
 *
 * The markup lives in TodayAgendaView (shared with the sandbox); this server
 * component only queries and shapes the rows.
 */

const MAX_ROWS = 12

export default async function TodayAgenda({
  tenantId,
  locale,
  t,
}: {
  tenantId: string
  locale: 'ro' | 'en'
  t: Translator
}) {
  const { start, end } = bucharestDayBounds()

  const where = {
    tenantId,
    deletedAt: null,
    status: { in: ['scheduled', 'in_progress'] as ExaminationStatus[] },
    scheduledAt: { gte: start, lte: end },
  }

  const [rows, total] = await Promise.all([
    prisma.examination.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }],
      take: MAX_ROWS,
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        signedAt: true,
        employee: { select: { firstName: true, lastName: true } },
        workplace: {
          select: { company: { select: { name: true } } },
        },
        examinationType: { select: { nameRo: true, nameEn: true } },
      },
    }),
    prisma.examination.count({ where }),
  ])

  const viewRows: AgendaViewRow[] = rows.map((e) => ({
    id: e.id,
    status: e.status,
    scheduledAt: e.scheduledAt,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
    signedAt: e.signedAt,
    name: `${e.employee.lastName} ${e.employee.firstName}`,
    company: e.workplace.company.name,
    type:
      locale === 'en'
        ? (e.examinationType.nameEn ?? e.examinationType.nameRo)
        : e.examinationType.nameRo,
  }))

  return <TodayAgendaView rows={viewRows} extra={total - rows.length} locale={locale} t={t} />
}

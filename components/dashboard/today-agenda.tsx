import type { ExaminationStatus } from '@prisma/client'
import Link from 'next/link'
import type { Translator } from '@/lib/i18n'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { bucharestDayBounds, bucharestTime } from '@/lib/time/bucharest'
import { prisma } from '@/lib/prisma'

/**
 * „Programări azi" — the day's appointments, by name, not just a count.
 *
 * Today is the Bucharest civil day (see lib/time/bucharest): an exam at 23:30
 * local time belongs to today even though it is the previous day in UTC.
 * Scope: scheduled + in_progress, ordered by time, max 12 rows.
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

  const extra = total - rows.length

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{t('dashboard.todayAgenda.title')}</h2>
        <Link
          href="/examinations?tab=programate"
          className="text-xs text-primary hover:underline"
        >
          {t('dashboard.todayAgenda.viewAll')}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('dashboard.todayAgenda.empty')}</p>
          <Link
            href="/examinations/new"
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            {t('dashboard.todayAgenda.schedule')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((e) => {
            const name = `${e.employee.lastName} ${e.employee.firstName}`
            const type = locale === 'en' ? (e.examinationType.nameEn ?? e.examinationType.nameRo) : e.examinationType.nameRo
            const actionLabel =
              e.status === 'in_progress'
                ? t('dashboard.todayAgenda.continue')
                : t('dashboard.todayAgenda.start')
            return (
              <li key={e.id}>
                <Link
                  href={`/examinations/${e.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {e.scheduledAt ? bucharestTime(e.scheduledAt) : '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.workplace.company.name} · {type}
                    </span>
                  </span>
                  <span className="hidden sm:block shrink-0">
                    <ExaminationStatusBadge
                      status={e.status}
                      scheduledAt={e.scheduledAt}
                      startedAt={e.startedAt}
                      completedAt={e.completedAt}
                      signedAt={e.signedAt}
                      locale={locale}
                    />
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary">{actionLabel}</span>
                </Link>
              </li>
            )
          })}
          {extra > 0 && (
            <li className="px-4 py-2 text-center">
              <Link
                href="/examinations?tab=programate"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('dashboard.todayAgenda.more').replace('{n}', String(extra))}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

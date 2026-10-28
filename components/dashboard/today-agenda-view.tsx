import Link from 'next/link'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import type { Translator } from '@/lib/i18n'
import { bucharestTime } from '@/lib/time/bucharest'

export interface AgendaViewRow {
  id: string
  status: string
  scheduledAt: Date | string | null
  startedAt: Date | string | null
  completedAt: Date | string | null
  signedAt: Date | string | null
  /** "Last First" display name */
  name: string
  /** company name */
  company: string
  /** localized examination-type name */
  type: string
}

/**
 * Presentational body of the dashboard "Programări azi" agenda. Extracted
 * from today-agenda.tsx so the real server component and the sandbox render
 * identical markup from already-shaped rows. `basePath` prefixes internal
 * hrefs (''=real app, '/sandbox'=demo).
 */
export function TodayAgendaView({
  rows,
  extra,
  locale,
  t,
  basePath = '',
}: {
  rows: AgendaViewRow[]
  extra: number
  locale: 'ro' | 'en'
  t: Translator
  basePath?: string
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{t('dashboard.todayAgenda.title')}</h2>
        <Link
          href={`${basePath}/examinations?tab=programate`}
          className="text-xs text-primary hover:underline"
        >
          {t('dashboard.todayAgenda.viewAll')}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('dashboard.todayAgenda.empty')}</p>
          <Link
            href={`${basePath}/examinations/new`}
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            {t('dashboard.todayAgenda.schedule')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((e) => {
            const actionLabel =
              e.status === 'in_progress'
                ? t('dashboard.todayAgenda.continue')
                : t('dashboard.todayAgenda.start')
            return (
              <li key={e.id}>
                <Link
                  href={`${basePath}/examinations/${e.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {e.scheduledAt
                      ? bucharestTime(
                          e.scheduledAt instanceof Date ? e.scheduledAt : new Date(e.scheduledAt)
                        )
                      : '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.company} · {e.type}
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
                href={`${basePath}/examinations?tab=programate`}
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

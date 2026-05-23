type ExaminationBadgeProps = {
  status: string
  scheduledAt?: Date | string | null
  startedAt?: Date | string | null
  completedAt?: Date | string | null
  signedAt?: Date | string | null
  locale?: 'ro' | 'en'
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

function formatDurationFromNow(
  from: Date | null,
  locale: 'ro' | 'en' = 'ro'
): string | null {
  if (!from) return null
  const diffMs = Date.now() - from.getTime()
  if (diffMs < 0) return null
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return locale === 'ro' ? 'acum' : 'now'
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return locale === 'ro' ? `${hours} ${hours === 1 ? 'oră' : 'ore'}` : `${hours}h`
  const days = Math.floor(hours / 24)
  return locale === 'ro' ? `${days} ${days === 1 ? 'zi' : 'zile'}` : `${days}d`
}

export function ExaminationStatusBadge({
  status,
  scheduledAt,
  startedAt,
  completedAt,
  signedAt,
  locale = 'ro',
}: ExaminationBadgeProps) {
  const dot: Record<string, string> = {
    scheduled:   'bg-blue-500',
    in_progress: 'bg-amber-500',
    completed:   'bg-purple-500',
    signed:      'bg-emerald-500',
    cancelled:   'bg-gray-400',
    no_show:     'bg-gray-400',
  }
  const cls: Record<string, string> = {
    scheduled:   'text-blue-800 border-blue-200 bg-blue-50/40',
    in_progress: 'text-amber-900 border-amber-200 bg-amber-50/40',
    completed:   'text-violet-900 border-violet-200 bg-violet-50/40',
    signed:      'text-emerald-900 border-emerald-200 bg-emerald-50/40',
    cancelled:   'text-slate-600 border-slate-200 bg-slate-50',
    no_show:     'text-slate-600 border-slate-200 bg-slate-50',
  }
  const labels: Record<string, string> = locale === 'en' ? {
    scheduled:   'Scheduled',
    in_progress: 'In progress',
    completed:   'Completed',
    signed:      'Signed',
    cancelled:   'Cancelled',
    no_show:     'No-show',
  } : {
    scheduled:   'Programată',
    in_progress: 'În curs',
    completed:   'Finalizată',
    signed:      'Semnată',
    cancelled:   'Anulată',
    no_show:     'Absent',
  }

  let stateSince: Date | null = null
  switch (status) {
    case 'in_progress': stateSince = toDate(startedAt); break
    case 'completed':   stateSince = toDate(completedAt); break
    case 'signed':      stateSince = toDate(signedAt); break
    case 'scheduled': {
      const d = toDate(scheduledAt)
      if (d && d.getTime() < Date.now()) stateSince = d
      break
    }
  }
  const duration = formatDurationFromNow(stateSince, locale)

  const dotCls = dot[status] ?? 'bg-gray-400'
  const textCls = cls[status] ?? 'text-gray-600 border-gray-200 bg-slate-50'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium tabular-nums ${textCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} aria-hidden />
      <span>{labels[status] ?? status}</span>
      {duration && (
        <>
          <span aria-hidden className="opacity-50">·</span>
          <span>{duration}</span>
        </>
      )}
    </span>
  )
}

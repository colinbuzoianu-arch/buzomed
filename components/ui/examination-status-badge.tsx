export function ExaminationStatusBadge({ status }: { status: string }) {
  const dot: Record<string, string> = {
    scheduled:   'bg-blue-500',
    in_progress: 'bg-amber-500',
    completed:   'bg-purple-500',
    signed:      'bg-emerald-500',
    cancelled:   'bg-gray-400',
    no_show:     'bg-gray-400',
  }
  const cls: Record<string, string> = {
    scheduled:   'text-blue-700 border-blue-200',
    in_progress: 'text-amber-700 border-amber-200',
    completed:   'text-purple-700 border-purple-200',
    signed:      'text-emerald-700 border-emerald-200',
    cancelled:   'text-gray-500 border-gray-200',
    no_show:     'text-gray-500 border-gray-200',
  }
  const labels: Record<string, string> = {
    scheduled:   'Programată',
    in_progress: 'În curs',
    completed:   'Finalizată',
    signed:      'Semnată',
    cancelled:   'Anulată',
    no_show:     'Absent',
  }
  const dotCls = dot[status] ?? 'bg-gray-400'
  const textCls = cls[status] ?? 'text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium tabular-nums ${textCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} />
      {labels[status] ?? status}
    </span>
  )
}

export function RecallStatusBadge({ status }: { status: string }) {
  const dot: Record<string, string> = {
    overdue:   'bg-red-500',
    pending:   'bg-amber-500',
    scheduled: 'bg-blue-500',
    completed: 'bg-emerald-500',
    cancelled: 'bg-gray-400',
  }
  const cls: Record<string, string> = {
    overdue:   'text-red-700 border-red-200',
    pending:   'text-amber-700 border-amber-200',
    scheduled: 'text-blue-700 border-blue-200',
    completed: 'text-emerald-700 border-emerald-200',
    cancelled: 'text-gray-500 border-gray-200',
  }
  const labels: Record<string, string> = {
    overdue:   'Expirat',
    pending:   'Scadent',
    scheduled: 'Programat',
    completed: 'Efectuat',
    cancelled: 'Anulat',
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

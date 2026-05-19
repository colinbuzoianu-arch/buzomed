export function ExaminationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled:   'text-blue-700    bg-blue-50    border-blue-200',
    in_progress: 'text-amber-700   bg-amber-50   border-amber-200',
    completed:   'text-purple-700  bg-purple-50  border-purple-200',
    signed:      'text-emerald-700 bg-emerald-50 border-emerald-200',
    cancelled:   'text-gray-500    bg-gray-50    border-gray-200',
    no_show:     'text-gray-500    bg-gray-50    border-gray-200',
  }
  const labels: Record<string, string> = {
    scheduled:   'Programată',
    in_progress: 'În curs',
    completed:   'Finalizată',
    signed:      'Semnată',
    cancelled:   'Anulată',
    no_show:     'Absent',
  }
  const cls = styles[status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}

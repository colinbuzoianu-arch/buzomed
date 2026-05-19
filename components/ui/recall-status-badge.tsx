export function RecallStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    overdue:   'text-red-700     bg-red-50     border-red-200',
    pending:   'text-amber-700   bg-amber-50   border-amber-200',
    scheduled: 'text-blue-700    bg-blue-50    border-blue-200',
    completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    cancelled: 'text-gray-500    bg-gray-50    border-gray-200',
  }
  const labels: Record<string, string> = {
    overdue:   'Expirat',
    pending:   'Scadent',
    scheduled: 'Programat',
    completed: 'Efectuat',
    cancelled: 'Anulat',
  }
  const cls = styles[status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft:     'text-gray-600    bg-gray-50    border-gray-200',
    issued:    'text-blue-700    bg-blue-50    border-blue-200',
    paid:      'text-emerald-700 bg-emerald-50 border-emerald-200',
    overdue:   'text-red-700     bg-red-50     border-red-200',
    cancelled: 'text-gray-400    bg-gray-50    border-gray-100',
  }
  const labels: Record<string, string> = {
    draft:     'Ciornă',
    issued:    'Emisă',
    paid:      'Încasată',
    overdue:   'Restantă',
    cancelled: 'Anulată',
  }
  const cls = styles[status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}

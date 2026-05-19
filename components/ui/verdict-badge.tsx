export function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    apt:             'text-emerald-700 bg-emerald-50 border-emerald-200',
    apt_conditionat: 'text-amber-700   bg-amber-50   border-amber-200',
    inapt_temporar:  'text-orange-700  bg-orange-50  border-orange-200',
    inapt:           'text-red-700     bg-red-50     border-red-200',
  }
  const labels: Record<string, string> = {
    apt:             'Apt',
    apt_conditionat: 'Apt condiționat',
    inapt_temporar:  'Inapt temporar',
    inapt:           'Inapt',
  }
  const cls = styles[verdict] ?? 'text-gray-600 bg-gray-50 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[verdict] ?? verdict}
    </span>
  )
}

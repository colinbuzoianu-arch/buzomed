export function VerdictBadge({ verdict }: { verdict: string }) {
  const dot: Record<string, string> = {
    apt:             'bg-emerald-500',
    apt_conditionat: 'bg-amber-500',
    inapt_temporar:  'bg-orange-500',
    inapt:           'bg-red-500',
  }
  const cls: Record<string, string> = {
    apt:             'text-emerald-700 border-emerald-200',
    apt_conditionat: 'text-amber-700 border-amber-200',
    inapt_temporar:  'text-orange-700 border-orange-200',
    inapt:           'text-red-700 border-red-200',
  }
  const labels: Record<string, string> = {
    apt:             'Apt',
    apt_conditionat: 'Apt condiționat',
    inapt_temporar:  'Inapt temporar',
    inapt:           'Inapt',
  }
  const dotCls = dot[verdict] ?? 'bg-gray-400'
  const textCls = cls[verdict] ?? 'text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium tabular-nums ${textCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotCls}`} />
      {labels[verdict] ?? verdict}
    </span>
  )
}

import Link from 'next/link'

export function AlertCard({
  href,
  label,
  value,
  tone,
  description,
}: {
  href: string
  label: string
  value: number
  tone: 'destructive' | 'warning'
  description: string
}) {
  const accent = tone === 'destructive'
    ? 'before:bg-[hsl(var(--accent-danger))]'
    : 'before:bg-[hsl(var(--accent-warning))]'
  const valueColor = tone === 'destructive'
    ? 'text-[hsl(var(--accent-danger))]'
    : 'text-[hsl(var(--accent-warning))]'
  const bg = tone === 'destructive'
    ? 'hover:bg-[hsl(0_72%_50%/0.06)]'
    : 'hover:bg-[hsl(38_92%_38%/0.06)]'

  return (
    <Link
      href={href}
      className={`group relative block rounded-lg border bg-card p-4 transition-colors before:absolute before:left-0 before:top-0 before:h-[2px] before:w-7 before:rounded-b-sm ${accent} ${bg}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div className={`mt-1.5 text-3xl font-medium tabular-nums tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-[hsl(var(--text-faint))]">
        {description}
      </div>
    </Link>
  )
}

export function StatCard({
  href,
  label,
  value,
  hint,
  accent = 'primary',
}: {
  href: string
  label: string
  value: number
  hint?: string
  accent?: 'primary' | 'positive' | 'warning' | 'danger' | 'muted'
}) {
  const accentClass = {
    primary:  'before:bg-primary',
    positive: 'before:bg-[hsl(var(--accent-positive))]',
    warning:  'before:bg-[hsl(var(--accent-warning))]',
    danger:   'before:bg-[hsl(var(--accent-danger))]',
    muted:    'before:bg-muted-foreground/30',
  }[accent]

  return (
    <Link
      href={href}
      className={`group relative block rounded-lg border bg-card p-4 transition-colors hover:bg-[hsl(var(--surface-tinted))] before:absolute before:left-0 before:top-0 before:h-[2px] before:w-7 before:rounded-b-sm ${accentClass}`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div className="mt-1.5 text-3xl font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-[11px] text-[hsl(var(--text-faint))] tabular-nums">
          {hint}
        </div>
      )}
    </Link>
  )
}

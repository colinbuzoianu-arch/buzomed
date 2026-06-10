'use client'

interface Props {
  firstName: string
  cabinetName: string
  formattedDate: string
  morning: string
  afternoon: string
  evening: string
}

export function DashboardGreeting({
  firstName,
  cabinetName,
  formattedDate,
  morning,
  afternoon,
  evening,
}: Props) {
  const hour = new Date().getHours()
  const label = hour < 12 ? morning : hour < 18 ? afternoon : evening

  return (
    <div>
      <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight text-foreground">
        {label},{' '}
        <em className="font-display italic text-primary">{firstName}</em>.
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[hsl(var(--text-muted))]">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-positive))]"
          aria-hidden
        />
        <span>{cabinetName}</span>
        <span aria-hidden className="text-[hsl(var(--text-faint))]">·</span>
        <span className="tabular-nums">{formattedDate}</span>
      </p>
    </div>
  )
}

'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface WorkplaceOption {
  id: string
  name: string
  companyName: string
}

interface Props {
  workplaces: WorkplaceOption[]
  currentValue: string
  placeholder: string
  allLabel: string
}

export function WorkplaceFilter({
  workplaces,
  currentValue,
  placeholder,
  allLabel,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) {
      params.set('wp', e.target.value)
    } else {
      params.delete('wp')
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  if (workplaces.length === 0) return null

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      aria-label={placeholder}
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors max-w-[220px] truncate"
    >
      <option value="">{allLabel}</option>
      <option value="no_workplace">Fără loc de muncă</option>
      {workplaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.companyName} — {w.name}
        </option>
      ))}
    </select>
  )
}

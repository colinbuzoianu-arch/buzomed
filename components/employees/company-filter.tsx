'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface CompanyOption {
  id: string
  name: string
}

interface Props {
  companies: CompanyOption[]
  currentValue: string
}

export function CompanyFilter({ companies, currentValue }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) {
      params.set('company', e.target.value)
    } else {
      params.delete('company')
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  if (companies.length < 2) return null

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      aria-label="Filtrează după companie"
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors max-w-[220px] truncate"
    >
      <option value="">Toate companiile</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

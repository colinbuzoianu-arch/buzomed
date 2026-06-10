'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Props {
  currentValue: string
}

export function RecallFilter({ currentValue }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    if (e.target.value) {
      params.set('recall', e.target.value)
    } else {
      params.delete('recall')
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={currentValue}
      onChange={handleChange}
      aria-label="Filtrează după scadență"
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors max-w-[180px] truncate"
    >
      <option value="">Toate scadențele</option>
      <option value="overdue">Depășite</option>
      <option value="soon">Scadente în curând</option>
      <option value="ok">La zi</option>
      <option value="none">Fără scadență</option>
    </select>
  )
}

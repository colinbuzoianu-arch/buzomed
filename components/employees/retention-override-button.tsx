'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/lib/toast'

interface Props {
  employeeId: string
  currentYears: number | null
  tenantDefault: number
}

export function RetentionOverrideButton({ employeeId, currentYears, tenantDefault }: Props) {
  const [open, setOpen] = useState(false)
  const [years, setYears] = useState<string>(currentYears?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataRetentionYears: years ? Number(years) : null }),
      })
      if (res.ok) {
        toastSuccess('Retenție actualizată')
        setOpen(false)
        router.refresh()
      } else {
        const json = await res.json().catch(() => ({}))
        toastError(json.error ?? 'Eroare la salvare.')
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {currentYears ? 'Modifică' : 'Setează'}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={years}
        onChange={e => setYears(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        <option value="">Implicit cabinet ({tenantDefault} ani)</option>
        <option value="10">10 ani</option>
        <option value="25">25 ani</option>
        <option value="40">40 ani (noxe speciale)</option>
      </select>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? '...' : 'OK'}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(false)}>✕</Button>
    </div>
  )
}

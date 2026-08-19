'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TOAST } from '@/lib/toast'

interface CompanyRow {
  id: string
  name: string
  cui: string | null
  city: string | null
}

interface Props {
  intermediaryId: string
  initialCompanies: CompanyRow[]
  availableCompanies: CompanyRow[]
  canWrite: boolean
  labels: {
    title: string
    empty: string
    linkLabel: string
    linkPlaceholder: string
    linkButton: string
    linking: string
    unlinkButton: string
    unlinking: string
    unlinkConfirm: string
    errorMessage: string
  }
}

export function IntermediaryCompaniesSection({
  intermediaryId,
  initialCompanies,
  availableCompanies,
  canWrite,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [companies, setCompanies] = useState(initialCompanies)
  const [available, setAvailable] = useState(availableCompanies)
  const [selectedId, setSelectedId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLink() {
    if (!selectedId) return
    setLinking(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intermediaryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setLinking(false)
        return
      }
      const linked = available.find((c) => c.id === selectedId)
      if (linked) {
        setCompanies((prev) => [...prev, linked].sort((a, b) => a.name.localeCompare(b.name)))
        setAvailable((prev) => prev.filter((c) => c.id !== selectedId))
      }
      setSelectedId('')
      TOAST.saved()
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('Link company failed', err)
      setError(labels.errorMessage)
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlink(company: CompanyRow) {
    if (!confirm(labels.unlinkConfirm.replace('{name}', company.name))) return
    setBusyId(company.id)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intermediaryId: '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || labels.errorMessage)
        setBusyId(null)
        return
      }
      setCompanies((prev) => prev.filter((c) => c.id !== company.id))
      setAvailable((prev) => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)))
      TOAST.saved()
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('Unlink company failed', err)
      setError(labels.errorMessage)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {labels.title}{' '}
        <span className="text-sm font-normal text-muted-foreground">({companies.length})</span>
      </h2>

      {canWrite && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="link-company" className="text-xs text-muted-foreground">
              {labels.linkLabel}
            </label>
            <select
              id="link-company"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={linking || available.length === 0}
              className="flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{labels.linkPlaceholder}</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={handleLink} disabled={linking || !selectedId}>
            {linking ? labels.linking : labels.linkButton}
          </Button>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      {companies.length === 0 ? (
        <EmptyState size="compact" illustration="companies" title={labels.empty} />
      ) : (
        <div className="border rounded-lg divide-y">
          {companies.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
            >
              <Link href={`/companies/${c.id}`} className="min-w-0">
                <div className="text-sm font-medium">{c.name}</div>
                {c.city && <div className="text-xs text-muted-foreground">{c.city}</div>}
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-xs text-muted-foreground tabular-nums">{c.cui ?? '—'}</div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnlink(c)}
                    disabled={busyId === c.id}
                  >
                    {busyId === c.id ? labels.unlinking : labels.unlinkButton}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

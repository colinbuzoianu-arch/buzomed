'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toastSuccess, toastWarning, toastError } from '@/lib/toast'

const REASONS = [
  'hired', 'promoted', 'transferred', 'role_change', 'department_change', 'other',
] as const
type Reason = (typeof REASONS)[number]

interface EmployeeResult {
  id: string
  firstName: string
  lastName: string
  companyEmployeeId: string | null
  companyName: string
}

export interface BulkAssignLabels {
  buttonLabel: string
  dialogTitle: string
  dialogDescription: string
  searchPlaceholder: string
  reasonLabel: string
  reasonHired: string
  reasonPromoted: string
  reasonTransferred: string
  reasonRoleChange: string
  reasonDepartmentChange: string
  reasonOther: string
  /** Template with {n} placeholder: "Atribuie ({n})" */
  confirmButton: string
  cancel: string
  noResults: string
  searchMinChars: string
  successToast: string
  /** Template with {success} and {failed} placeholders */
  partialToast: string
  errorMessage: string
}

interface Props {
  workplaceId: string
  companyId: string
  /** Used for client-side filtering since the search API doesn't accept companyId */
  companyName: string
  existingEmployeeIds: string[]
  labels: BulkAssignLabels
}

export function BulkAssignEmployees({
  workplaceId,
  companyName,
  existingEmployeeIds,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EmployeeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState<Reason>('transferred')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleOpen() {
    setQuery('')
    setResults([])
    setSelected(new Set())
    setReason('transferred')
    setError(null)
    setOpen(true)
  }

  // Debounced search — client-side company filter since the API has no companyId param
  useEffect(() => {
    if (!open) return
    if (query.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/employees/search?q=${encodeURIComponent(query)}&limit=50`
        )
        const data = (await res.json()) as { employees?: EmployeeResult[] }
        const filtered = (data.employees ?? []).filter(
          (e) =>
            e.companyName === companyName &&
            !existingEmployeeIds.includes(e.id)
        )
        setResults(filtered)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, companyName, existingEmployeeIds])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleConfirm() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/employees/bulk-assign-workplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: Array.from(selected),
          workplaceId,
          reason,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        summary?: { total: number; success: number; failed: number }
        error?: string
        message?: string
      }

      if (!res.ok) {
        setError(data.message || data.error || labels.errorMessage)
        return
      }

      const { success, failed } = data.summary!

      if (failed > 0 && success === 0) {
        setError(labels.errorMessage)
        return
      }

      setOpen(false)
      if (failed > 0) {
        toastWarning(
          labels.partialToast
            .replace('{success}', String(success))
            .replace('{failed}', String(failed))
        )
      } else {
        toastSuccess(labels.successToast)
      }
      startTransition(() => router.refresh())
    } catch {
      toastError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const reasonText: Record<Reason, string> = {
    hired: labels.reasonHired,
    promoted: labels.reasonPromoted,
    transferred: labels.reasonTransferred,
    role_change: labels.reasonRoleChange,
    department_change: labels.reasonDepartmentChange,
    other: labels.reasonOther,
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        {labels.buttonLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!submitting) {
            setOpen(o)
            if (!o) setError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Input
              placeholder={labels.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />

            <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              {!loading && query.length < 2 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {labels.searchMinChars}
                </p>
              )}
              {!loading && query.length >= 2 && results.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {labels.noResults}
                </p>
              )}
              {results.map((emp) => (
                <label
                  key={emp.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(emp.id)}
                    onChange={() => toggle(emp.id)}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {emp.lastName} {emp.firstName}
                    </div>
                    {emp.companyEmployeeId && (
                      <div className="text-xs text-muted-foreground">
                        {emp.companyEmployeeId}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-assign-reason">{labels.reasonLabel}</Label>
              <select
                id="bulk-assign-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as Reason)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {reasonText[r]}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || selected.size === 0}
            >
              {labels.confirmButton.replace('{n}', String(selected.size))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

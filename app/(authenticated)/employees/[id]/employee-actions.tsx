'use client'

import { TOAST } from '@/lib/toast'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const ARCHIVE_REASONS = [
  'left_employment',
  'retired',
  'deceased',
  'transferred',
  'other',
] as const
type ArchiveReason = (typeof ARCHIVE_REASONS)[number]

interface Labels {
  archive: string
  archiving: string
  archiveConfirm: string
  archiveDialogTitle: string
  archiveReasonLabel: string
  archiveReasons: Record<ArchiveReason, string>
  unarchive: string
  unarchiveConfirm: string
  delete: string
  deleteConfirm: string
  deleting: string
  cancel: string
  errorMessage: string
  submit: string
}

interface Props {
  employeeId: string
  employeeName: string
  isArchived: boolean
  labels: Labels
}

/**
 * Archive / unarchive / delete actions for an employee.
 *
 * Three distinct verbs because they mean different things:
 *   - archive   = "no longer at this employer". Keeps the row queryable
 *                 for medical history. Requires a reason.
 *   - unarchive = restore from archive (re-employed). No reason needed.
 *   - delete    = soft delete for mistakes / GDPR erasure. Hides the row
 *                 from all reads. The row stays in the DB until a hard-
 *                 delete pass runs (not yet built).
 */
export function EmployeeActions({
  employeeId,
  employeeName,
  isArchived,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveReason, setArchiveReason] =
    useState<ArchiveReason>('left_employment')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleArchiveSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archive: true,
          archivedReason: archiveReason,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }
      setArchiveDialogOpen(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Archive failed', err)
      setError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUnarchive() {
    if (!confirm(labels.unarchiveConfirm.replace('{name}', employeeName))) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unarchive: true }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Unarchive failed', err)
      setError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!confirm(labels.deleteConfirm.replace('{name}', employeeName))) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }
      startTransition(() => {
        router.push('/employees')
        router.refresh()
      })
    } catch (err) {
      console.error('Delete failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {isArchived ? (
          <Button
            variant="outline"
            onClick={handleUnarchive}
            disabled={submitting}
          >
            {labels.unarchive}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setArchiveDialogOpen(true)}
            disabled={submitting}
          >
            {labels.archive}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={submitting}
          className="text-destructive hover:text-destructive"
        >
          {submitting ? labels.deleting : labels.delete}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}

      <Dialog
        open={archiveDialogOpen}
        onOpenChange={(open) => {
          setArchiveDialogOpen(open)
          if (!open) setError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.archiveDialogTitle}</DialogTitle>
            <DialogDescription>
              {labels.archiveConfirm.replace('{name}', employeeName)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="archiveReason">{labels.archiveReasonLabel}</Label>
            <select
              id="archiveReason"
              value={archiveReason}
              onChange={(e) =>
                setArchiveReason(e.target.value as ArchiveReason)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {ARCHIVE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {labels.archiveReasons[r]}
                </option>
              ))}
            </select>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={submitting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleArchiveSubmit}
              disabled={submitting}
            >
              {submitting ? labels.archiving : labels.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

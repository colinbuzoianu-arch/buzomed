'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

/**
 * Assignment manager for the employee detail page.
 *
 * Three actions, all driven by the same POST /api/employees/[id]/assignments
 * + PATCH /api/employees/[id]/assignments/[aid] endpoints:
 *
 *   - **Assign** (no current assignment): pick a workplace, optional notes.
 *   - **Reassign** (current assignment exists): pick a different workplace,
 *     pick a reason. The API auto-ends the previous one.
 *   - **End** (current assignment exists): close without replacement. Used
 *     when someone goes on extended leave but isn't being archived yet.
 */

const ASSIGNMENT_REASONS = [
  'hired',
  'promoted',
  'transferred',
  'role_change',
  'department_change',
  'other',
] as const
type AssignmentReason = (typeof ASSIGNMENT_REASONS)[number]

interface WorkplaceOption {
  id: string
  name: string
  department: string | null
  companyName: string
}

interface Labels {
  assignButton: string
  reassignButton: string
  endButton: string
  ending: string

  dialogAssignTitle: string
  dialogReassignTitle: string
  dialogAssignDescription: string
  dialogReassignDescription: string
  workplaceLabel: string
  workplacePlaceholder: string
  reasonLabel: string
  notesLabel: string
  submitting: string
  submit: string
  cancel: string

  endConfirm: string

  reasonHired: string
  reasonPromoted: string
  reasonTransferred: string
  reasonRoleChange: string
  reasonDepartmentChange: string
  reasonOther: string

  errorMessage: string
  noWorkplaces: string
}

interface Props {
  employeeId: string
  currentAssignmentId: string | null
  workplaces: WorkplaceOption[]
  labels: Labels
}

export function EmployeeAssignmentManager({
  employeeId,
  currentAssignmentId,
  workplaces,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [workplaceId, setWorkplaceId] = useState('')
  const [reason, setReason] = useState<AssignmentReason>(
    currentAssignmentId ? 'transferred' : 'hired'
  )
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReassign = currentAssignmentId !== null
  const hasWorkplaces = workplaces.length > 0

  function openDialog() {
    setWorkplaceId('')
    setReason(isReassign ? 'transferred' : 'hired')
    setNotes('')
    setError(null)
    setDialogOpen(true)
  }

  async function handleAssignSubmit() {
    if (!workplaceId) {
      setError(labels.errorMessage)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/employees/${employeeId}/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workplaceId,
            reasonForChange: reason,
            notes: notes.trim() || null,
          }),
        }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }
      setDialogOpen(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Assign failed', err)
      setError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEnd() {
    if (!currentAssignmentId) return
    if (!confirm(labels.endConfirm)) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/employees/${employeeId}/assignments/${currentAssignmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ end: true }),
        }
      )
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
      console.error('End assignment failed', err)
      setError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const reasonText: Record<AssignmentReason, string> = {
    hired: labels.reasonHired,
    promoted: labels.reasonPromoted,
    transferred: labels.reasonTransferred,
    role_change: labels.reasonRoleChange,
    department_change: labels.reasonDepartmentChange,
    other: labels.reasonOther,
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {isReassign && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnd}
            disabled={submitting}
          >
            {submitting ? labels.ending : labels.endButton}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={openDialog}
          disabled={submitting || !hasWorkplaces}
        >
          {isReassign ? labels.reassignButton : labels.assignButton}
        </Button>
      </div>
      {!hasWorkplaces && (
        <span className="text-xs text-muted-foreground">
          {labels.noWorkplaces}
        </span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isReassign
                ? labels.dialogReassignTitle
                : labels.dialogAssignTitle}
            </DialogTitle>
            <DialogDescription>
              {isReassign
                ? labels.dialogReassignDescription
                : labels.dialogAssignDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="workplaceId">{labels.workplaceLabel}</Label>
              <select
                id="workplaceId"
                value={workplaceId}
                onChange={(e) => setWorkplaceId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{labels.workplacePlaceholder}</option>
                {workplaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.companyName} — {w.name}
                    {w.department ? ` (${w.department})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">{labels.reasonLabel}</Label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as AssignmentReason)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {ASSIGNMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {reasonText[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{labels.notesLabel}</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
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
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleAssignSubmit}
              disabled={submitting || !workplaceId}
            >
              {submitting ? labels.submitting : labels.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

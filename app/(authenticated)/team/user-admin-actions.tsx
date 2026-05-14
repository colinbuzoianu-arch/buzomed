'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@prisma/client'
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

interface Props {
  userId: string
  userDisplayName: string
  currentRoles: UserRole[]
  currentIsActive: boolean
  currentProfessionalTitle: string
  assignableRoles: UserRole[]
  labels: Record<string, string>
}

export function UserAdminActions({
  userId,
  userDisplayName,
  currentRoles,
  currentIsActive,
  currentProfessionalTitle,
  assignableRoles,
  labels,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [roles, setRoles] = useState<UserRole[]>(currentRoles)
  const [isActive, setIsActive] = useState(currentIsActive)
  const [professionalTitle, setProfessionalTitle] = useState(
    currentProfessionalTitle
  )
  const [busy, setBusy] = useState<'saving' | 'archiving' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(role: UserRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  function roleLabel(role: UserRole): string {
    switch (role) {
      case 'practice_admin':
        return labels.rolePracticeAdmin
      case 'practitioner':
        return labels.rolePractitioner
      case 'assistant':
        return labels.roleAssistant
      default:
        return role
    }
  }

  async function handleSave() {
    if (roles.length === 0) {
      setError(labels.errorMessage)
      return
    }
    setBusy('saving')
    setError(null)
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles,
          isActive,
          professionalTitle: professionalTitle.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.error === 'last_admin_protected') {
          setError(labels.errorLastAdmin)
        } else if (data.error === 'no_changes') {
          // Treat as success — nothing to do.
          setOpen(false)
          setBusy(null)
          return
        } else {
          const issues = (data.issues as string[] | undefined)?.join('; ')
          setError(issues || data.message || data.reason || labels.errorMessage)
        }
        setBusy(null)
        return
      }
      setOpen(false)
      setBusy(null)
      router.refresh()
    } catch (err) {
      console.error('User update failed', err)
      setError(labels.errorMessage)
      setBusy(null)
    }
  }

  async function handleArchive() {
    if (!confirm(labels.archiveConfirm.replace('{name}', userDisplayName))) {
      return
    }
    setBusy('archiving')
    setError(null)
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.error === 'last_admin_protected') {
          setError(labels.errorLastAdmin)
        } else {
          setError(data.message || data.reason || labels.errorMessage)
        }
        setBusy(null)
        return
      }
      setOpen(false)
      setBusy(null)
      router.refresh()
    } catch (err) {
      console.error('User archive failed', err)
      setError(labels.errorMessage)
      setBusy(null)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {labels.editAction}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>
              {labels.dialogDescription.replace('{name}', userDisplayName)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{labels.fieldRoles}</Label>
              <div className="flex flex-col gap-2">
                {assignableRoles.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      disabled={busy !== null}
                    />
                    <span>{roleLabel(role)}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {labels.fieldRolesHelp}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`title-${userId}`}>
                {labels.fieldProfessionalTitle}
              </Label>
              <Input
                id={`title-${userId}`}
                value={professionalTitle}
                onChange={(e) => setProfessionalTitle(e.target.value)}
                disabled={busy !== null}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy !== null}
                />
                <span>{labels.fieldIsActive}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {labels.fieldIsActiveHelp}
              </p>
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/5 border border-destructive rounded-md p-2">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleArchive}
              disabled={busy !== null}
            >
              {busy === 'archiving' ? labels.archiving : labels.archiveAction}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy !== null}
              >
                {labels.cancel}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={busy !== null}
              >
                {busy === 'saving' ? labels.saving : labels.submit}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Interactive invite section for a tenant.
 *
 * - "Invite practice admin" button opens a Dialog with email + name fields.
 * - Pending invitations table with revoke buttons.
 * - On successful create or revoke, calls router.refresh() to re-fetch
 *   the server component above and update the table from the source of truth.
 *   We don't trust optimistic updates here — invitations have side effects
 *   (email send) and we want the displayed state to match the DB.
 */

interface PendingInvitation {
  id: string
  email: string
  role: string
  invitedByName: string
  expiresAt: string // ISO string
}

interface Labels {
  sectionTitle: string
  inviteButton: string
  noPending: string
  columnEmail: string
  columnRole: string
  columnInvitedBy: string
  columnExpiresAt: string
  columnActions: string
  revokeAction: string
  revokeConfirm: string
  dialogTitle: string
  dialogDescription: string
  fieldEmail: string
  fieldEmailPlaceholder: string
  fieldName: string
  fieldNamePlaceholder: string
  fieldNameOptional: string
  fieldRole: string
  sendInvite: string
  sending: string
  cancel: string
  successMessage: string
  errorMessage: string
  errorAlreadyActive: string
  errorInvalidEmail: string
  rolePracticeAdmin: string
  locale: 'ro' | 'en'
}

interface Props {
  tenantId: string
  tenantName: string
  labels: Labels
  initialPendingInvitations: PendingInvitation[]
}

export function TenantInviteSection({
  tenantId,
  tenantName,
  labels,
  initialPendingInvitations,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    recipientName: '',
  })
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const dateFormatter = new Intl.DateTimeFormat(
    labels.locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  function resetForm() {
    setForm({ email: '', recipientName: '' })
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          role: 'practice_admin',
          tenantId,
          recipientName: form.recipientName.trim() || undefined,
          locale: labels.locale,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        // Map known service errors to friendly messages
        const errorCode = data.error as string | undefined
        if (errorCode === 'user_already_active') {
          setError(labels.errorAlreadyActive)
        } else if (errorCode === 'invalid_email') {
          setError(labels.errorInvalidEmail)
        } else if (errorCode === 'validation_failed') {
          setError(
            (data.issues as string[] | undefined)?.[0] ?? labels.errorMessage
          )
        } else {
          setError(data.message || data.error || labels.errorMessage)
        }
        setSubmitting(false)
        return
      }

      // Success — reset form, close dialog, refresh server data
      setSuccess(labels.successMessage.replace('{email}', form.email.trim()))
      resetForm()
      setDialogOpen(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Invite request failed', err)
      setError(labels.errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(invitationId: string, email: string) {
    if (!confirm(labels.revokeConfirm.replace('{email}', email))) return

    setRevokingId(invitationId)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(
        `/api/invitations/${invitationId}/revoke`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || labels.errorMessage)
        return
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      console.error('Revoke failed', err)
      setError(labels.errorMessage)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {labels.sectionTitle}
          {initialPendingInvitations.length > 0 && (
            <span className="text-muted-foreground font-normal text-base ml-2">
              ({initialPendingInvitations.length})
            </span>
          )}
        </h2>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button>+ {labels.inviteButton}</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{labels.dialogTitle}</DialogTitle>
                <DialogDescription>
                  {labels.dialogDescription.replace('{tenant}', tenantName)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">{labels.fieldEmail} *</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder={labels.fieldEmailPlaceholder}
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-name">
                    {labels.fieldName}{' '}
                    <span className="text-muted-foreground text-xs">
                      ({labels.fieldNameOptional})
                    </span>
                  </Label>
                  <Input
                    id="invite-name"
                    value={form.recipientName}
                    onChange={(e) =>
                      setForm({ ...form, recipientName: e.target.value })
                    }
                    placeholder={labels.fieldNamePlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{labels.fieldRole}</Label>
                  <div className="text-sm border rounded-md px-3 py-2 bg-muted">
                    {labels.rolePracticeAdmin}
                  </div>
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
                <Button type="submit" disabled={submitting || !form.email.trim()}>
                  {submitting ? labels.sending : labels.sendInvite}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {success && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
          {success}
        </div>
      )}

      {!dialogOpen && error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      {initialPendingInvitations.length === 0 ? (
        <EmptyState
          size="compact"
          illustration="team"
          title={labels.noPending}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.columnEmail}</TableHead>
                <TableHead>{labels.columnRole}</TableHead>
                <TableHead>{labels.columnInvitedBy}</TableHead>
                <TableHead>{labels.columnExpiresAt}</TableHead>
                <TableHead className="text-right">
                  {labels.columnActions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialPendingInvitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <span className="inline-block px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground">
                      {labels.rolePracticeAdmin}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {inv.invitedByName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dateFormatter.format(new Date(inv.expiresAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(inv.id, inv.email)}
                      disabled={revokingId === inv.id || isPending}
                    >
                      {revokingId === inv.id
                        ? labels.sending
                        : labels.revokeAction}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

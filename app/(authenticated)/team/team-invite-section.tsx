'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@prisma/client'
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
import { formatDate } from '@/lib/format-date'

/**
 * Interactive invite section for the /team page.
 *
 * Differs from TenantInviteSection (super-admin) in two ways:
 * 1. Role is a dropdown — practice_admin can pick practitioner|assistant,
 *    practitioner can only pick assistant. The dropdown is populated from
 *    the `allowedRoles` prop computed server-side via invitableRoles().
 * 2. If `allowedRoles` is single-value, we still render as a select so the
 *    UI is consistent — the user just doesn't have a real choice.
 */

interface PendingInvitation {
  id: string
  email: string
  role: string
  invitedByName: string
  expiresAt: string
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
  rolePractitioner: string
  roleAssistant: string
  roleCompanyHr: string
  locale: 'ro' | 'en'
}

interface CompanyOption {
  id: string
  name: string
}

interface Props {
  tenantId: string
  tenantName: string
  allowedRoles: UserRole[]
  labels: Labels
  initialPendingInvitations: PendingInvitation[]
  companies: CompanyOption[]
}

export function TeamInviteSection({
  tenantId,
  tenantName,
  allowedRoles,
  labels,
  initialPendingInvitations,
  companies,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Default the dropdown to the first invitable role. For practitioners
  // this is automatically 'assistant' (the only option).
  const [form, setForm] = useState({
    email: '',
    recipientName: '',
    role: allowedRoles[0],
  })

  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])

  function roleLabel(role: string): string {
    if (role === 'practice_admin') return labels.rolePracticeAdmin
    if (role === 'practitioner') return labels.rolePractitioner
    if (role === 'assistant') return labels.roleAssistant
    if (role === 'company_hr') return labels.roleCompanyHr
    return role
  }

  function resetForm() {
    setForm({ email: '', recipientName: '', role: allowedRoles[0] })
    setSelectedCompanyIds([])
    setError(null)
  }

  function toggleCompany(id: string) {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      if (form.role === 'company_hr' && selectedCompanyIds.length === 0) {
        setError('Selectați cel puțin o companie pentru accesul HR.')
        setSubmitting(false)
        return
      }

      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          role: form.role,
          tenantId,
          recipientName: form.recipientName.trim() || undefined,
          locale: labels.locale,
          ...(form.role === 'company_hr' && { companyIds: selectedCompanyIds }),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
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
                  <Label htmlFor="invite-role">{labels.fieldRole} *</Label>
                  {allowedRoles.length === 1 ? (
                    <div className="text-sm border rounded-md px-3 py-2 bg-muted">
                      {roleLabel(allowedRoles[0])}
                    </div>
                  ) : (
                    <select
                      id="invite-role"
                      value={form.role}
                      onChange={(e) => {
                        setForm({ ...form, role: e.target.value as UserRole })
                        setSelectedCompanyIds([])
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {allowedRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {form.role === 'company_hr' && companies.length > 0 && (
                  <div className="space-y-2">
                    <Label>Acces companii *</Label>
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                      {companies.map((company) => (
                        <label
                          key={company.id}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCompanyIds.includes(company.id)}
                            onChange={() => toggleCompany(company.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span className="text-sm">{company.name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedCompanyIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Selectați cel puțin o companie.
                      </p>
                    )}
                  </div>
                )}

                {form.role === 'company_hr' && companies.length === 0 && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                    Nu există companii în acest cabinet. Adăugați mai întâi o companie.
                  </div>
                )}

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
                  type="submit"
                  disabled={submitting || !form.email.trim()}
                >
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
                      {roleLabel(inv.role)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {inv.invitedByName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(inv.expiresAt, 'medium', labels.locale === 'ro' ? 'ro' : 'en')}
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

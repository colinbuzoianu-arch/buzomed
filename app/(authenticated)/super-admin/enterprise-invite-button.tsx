'use client'

import { useState } from 'react'
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

interface Props {
  labels: Record<string, string>
}

export function EnterpriseInviteButton({ labels }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [cabinetName, setCabinetName] = useState('')
  const [notes, setNotes] = useState('')
  const [inviteLocale, setInviteLocale] = useState<'ro' | 'en'>('ro')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setEmail('')
    setFirstName('')
    setLastName('')
    setCabinetName('')
    setNotes('')
    setInviteLocale('ro')
    setSubmitting(false)
    setSuccess(null)
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/tenants/enterprise-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          cabinetName: cabinetName.trim() || undefined,
          locale: inviteLocale,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok && response.status !== 207) {
        if (data.error === 'email_already_exists') {
          setError(labels.errorEmailExists)
        } else {
          const issues = (data.issues as string[] | undefined)?.join('; ')
          setError(issues || data.message || data.error || labels.errorMessage)
        }
        setSubmitting(false)
        return
      }
      setSuccess(data.tenantName ?? labels.successMessage)
      setSubmitting(false)
      router.refresh()
    } catch (err) {
      console.error('Enterprise invite failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {labels.buttonLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!submitting) { setOpen(o); if (!o) reset() }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="space-y-3">
              <div className="border border-green-200 bg-green-50 text-green-900 rounded-md p-4 text-sm space-y-1">
                <p className="font-medium">{labels.successMessage}</p>
                <p className="text-xs text-green-700">Cabinet: {success}</p>
              </div>
              <Button onClick={() => { setOpen(false); reset() }} className="w-full">OK</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ent-first">{labels.fieldFirstName}</Label>
                    <Input
                      id="ent-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={submitting}
                      placeholder="Ion"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ent-last">{labels.fieldLastName}</Label>
                    <Input
                      id="ent-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={submitting}
                      placeholder="Popescu"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ent-email">{labels.fieldEmail}</Label>
                  <Input
                    id="ent-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    placeholder="ion.popescu@cabinet.ro"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ent-cabinet">{labels.fieldCabinetName}</Label>
                  <Input
                    id="ent-cabinet"
                    value={cabinetName}
                    onChange={(e) => setCabinetName(e.target.value)}
                    disabled={submitting}
                    placeholder={`Cabinet Enterprise ${lastName || 'Popescu'}`}
                  />
                  <p className="text-xs text-muted-foreground">{labels.fieldCabinetNameHelp}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ent-locale">{labels.fieldLocale}</Label>
                  <select
                    id="ent-locale"
                    value={inviteLocale}
                    onChange={(e) => setInviteLocale(e.target.value as 'ro' | 'en')}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="ro">Română</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ent-notes">{labels.fieldNotes}</Label>
                  <textarea
                    id="ent-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                    rows={3}
                    placeholder={labels.fieldNotesPlaceholder}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  />
                </div>

                {error && (
                  <div className="text-xs text-destructive border border-destructive bg-destructive/5 rounded-md p-2">
                    {error}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setOpen(false); reset() }}
                  disabled={submitting}
                >
                  {labels.cancel}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !email.trim() || !firstName.trim() || !lastName.trim()}
                >
                  {submitting ? labels.submitting : labels.submit}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

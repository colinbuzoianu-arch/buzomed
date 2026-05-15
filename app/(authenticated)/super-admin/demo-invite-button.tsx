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

interface SeedResult {
  tenantId: string
  tenantName: string
  seeded: { companies: number; employees: number; examinations: number; recalls: number }
}

export function DemoInviteButton({ labels }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [cabinetName, setCabinetName] = useState('')
  const [inviteLocale, setInviteLocale] = useState<'ro' | 'en'>('ro')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setEmail('')
    setFirstName('')
    setLastName('')
    setCabinetName('')
    setInviteLocale('ro')
    setSubmitting(false)
    setResult(null)
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/tenants/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          cabinetName: cabinetName.trim() || undefined,
          locale: inviteLocale,
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
      setResult(data)
      setSubmitting(false)
      router.refresh()
    } catch (err) {
      console.error('Demo invite failed', err)
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
          if (!submitting) {
            setOpen(o)
            if (!o) reset()
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-3">
              <div className="border border-green-200 bg-green-50 text-green-900 rounded-md p-4 text-sm space-y-1">
                <p className="font-medium">{labels.successMessage}</p>
                <p className="text-xs text-green-700">
                  Cabinet: {result.tenantName}
                </p>
                <p className="text-xs text-green-700">
                  Seeded: {result.seeded.companies} companies ·{' '}
                  {result.seeded.employees} employees ·{' '}
                  {result.seeded.examinations} exams ·{' '}
                  {result.seeded.recalls} recalls
                </p>
              </div>
              <Button onClick={() => { setOpen(false); reset() }} className="w-full">
                OK
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-first">{labels.fieldFirstName}</Label>
                    <Input
                      id="demo-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={submitting}
                      placeholder="Ion"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo-last">{labels.fieldLastName}</Label>
                    <Input
                      id="demo-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={submitting}
                      placeholder="Popescu"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="demo-email">{labels.fieldEmail}</Label>
                  <Input
                    id="demo-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    placeholder="ion.popescu@cabinet.ro"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="demo-cabinet">{labels.fieldCabinetName}</Label>
                  <Input
                    id="demo-cabinet"
                    value={cabinetName}
                    onChange={(e) => setCabinetName(e.target.value)}
                    disabled={submitting}
                    placeholder={`Cabinet Demo ${lastName || 'Popescu'}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {labels.fieldCabinetNameHelp}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="demo-locale">{labels.fieldLocale}</Label>
                  <select
                    id="demo-locale"
                    value={inviteLocale}
                    onChange={(e) => setInviteLocale(e.target.value as 'ro' | 'en')}
                    disabled={submitting}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="ro">Română</option>
                    <option value="en">English</option>
                  </select>
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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface InvitationData {
  email: string
  role: string
  tenantName: string
  inviterName: string
  expiresAt: string
  locale: 'ro' | 'en'
}

interface Labels {
  title: string
  /** Intro text with {inviter}, {tenant}, {role} placeholders */
  introTemplate: string
  emailLabel: string
  emailHelp: string
  firstNameLabel: string
  lastNameLabel: string
  passwordLabel: string
  passwordHelp: string
  submitButton: string
  submitting: string
  roleLabel: string
  successMessage: string
  errorMessage: string
  errorInvalidPassword: string
  errorInvalidName: string
  errorAlreadyFinalized: string
  errorServiceUnavailable: string
  errorTermsRequired: string
  signInCta: string
}

interface Props {
  token: string
  invitation: InvitationData
  labels: Labels
}

export function AcceptInviteForm({ token, invitation, labels }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    password: '',
    termsAccepted: false,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const response = await fetch(
        `/api/invitations/accept/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            password: form.password,
            termsAccepted: form.termsAccepted,
          }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const code = data.error as string | undefined
        if (code === 'invalid_password') setError(labels.errorInvalidPassword)
        else if (code === 'invalid_name') setError(labels.errorInvalidName)
        else if (
          code === 'expired' ||
          code === 'revoked' ||
          code === 'already_accepted'
        )
          setError(labels.errorAlreadyFinalized)
        else if (code === 'service_unavailable')
          setError(labels.errorServiceUnavailable)
        else if (code === 'terms_required')
          setError(labels.errorTermsRequired)
        else setError(data.message || labels.errorMessage)
        setSubmitting(false)
        return
      }

      // Success — show message briefly, then redirect to login with email
      // pre-filled via query param. The login page can read this and
      // populate the email field automatically.
      setSuccess(true)
      setTimeout(() => {
        const loginUrl = `/login?email=${encodeURIComponent(invitation.email)}&accepted=1`
        router.push(loginUrl)
      }, 1500)
    } catch (err) {
      console.error('Accept failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-card border rounded-lg p-8 text-center space-y-4">
        <div className="inline-flex w-12 h-12 rounded-full bg-green-100 items-center justify-center">
          <svg
            className="w-6 h-6 text-green-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold">{labels.successMessage}</h2>
        <p className="text-sm text-muted-foreground">{labels.signInCta}...</p>
      </div>
    )
  }

  // Build the intro paragraph from the template
  const intro = labels.introTemplate
    .replace('{inviter}', invitation.inviterName)
    .replace('{tenant}', invitation.tenantName)
    .replace('{role}', labels.roleLabel)

  return (
    <div className="bg-card border rounded-lg p-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email is read-only — comes from the invitation, user can't change it */}
        <div className="space-y-2">
          <Label htmlFor="accept-email">{labels.emailLabel}</Label>
          <Input
            id="accept-email"
            type="email"
            value={invitation.email}
            disabled
            readOnly
          />
          <p className="text-xs text-muted-foreground">{labels.emailHelp}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="accept-firstName">
              {labels.firstNameLabel} *
            </Label>
            <Input
              id="accept-firstName"
              value={form.firstName}
              onChange={(e) =>
                setForm({ ...form, firstName: e.target.value })
              }
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accept-lastName">{labels.lastNameLabel} *</Label>
            <Input
              id="accept-lastName"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accept-password">{labels.passwordLabel} *</Label>
          <Input
            id="accept-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">{labels.passwordHelp}</p>
        </div>

        <div className="flex items-start gap-2 pt-1">
          <input
            id="accept-terms"
            type="checkbox"
            checked={form.termsAccepted}
            onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
          />
          <label htmlFor="accept-terms" className="text-sm text-foreground leading-relaxed cursor-pointer">
            Am citit și accept{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline text-primary hover:text-primary/80">
              Termenii și Condițiile
            </a>
            {' '}și{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline text-primary hover:text-primary/80">
              Politica de Confidențialitate
            </a>
            , inclusiv Acordul de Prelucrare a Datelor (Art. 28 GDPR).
          </label>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={
            submitting ||
            !form.firstName.trim() ||
            !form.lastName.trim() ||
            form.password.length < 8 ||
            !form.termsAccepted
          }
        >
          {submitting ? labels.submitting : labels.submitButton}
        </Button>
      </form>
    </div>
  )
}

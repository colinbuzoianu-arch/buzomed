'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  labels: {
    emailLabel: string
    emailPlaceholder: string
    submitButton: string
    submitting: string
    successMessage: string
    errorMessage: string
  }
}

export function ForgotPasswordForm({ labels }: Props) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      // The redirectTo URL must be on your domain. Supabase sends an email
      // with a link to this URL containing the recovery token, and our
      // /reset-password page handles the token exchange.
      const redirectTo = `${window.location.origin}/reset-password`
      // Note: Supabase's resetPasswordForEmail returns success even if the
      // email doesn't exist in the system. This is deliberate — leaking
      // which addresses have accounts is a security anti-pattern. We mirror
      // that behavior by always showing the success message.
      const { error: supabaseError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        })
      if (supabaseError) {
        // Only show errors for malformed requests, not "no such email"
        console.error('Reset request error:', supabaseError)
        setError(labels.errorMessage)
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setSubmitting(false)
    } catch (err) {
      console.error('Reset request crashed:', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 text-green-900 p-4 text-sm">
        {labels.successMessage}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{labels.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={labels.emailPlaceholder}
          required
          disabled={submitting}
          autoComplete="email"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/5 text-destructive p-3 text-sm">
          {error}
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? labels.submitting : labels.submitButton}
      </Button>
    </form>
  )
}

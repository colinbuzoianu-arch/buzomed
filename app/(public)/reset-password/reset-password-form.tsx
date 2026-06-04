'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  labels: {
    passwordLabel: string
    confirmLabel: string
    submitButton: string
    submitting: string
    successMessage: string
    errorMessage: string
    errorMismatch: string
    errorTooShort: string
    errorTokenInvalid: string
    goToApp: string
  }
}

const MIN_PASSWORD_LENGTH = 8

/**
 * Reset password form.
 *
 * Supabase's password-reset flow works by sending the user a link with
 * a recovery token in the URL fragment. The Supabase JS client picks up
 * this token automatically on page load (it's part of the SSR auth
 * helpers behavior) and establishes a temporary session that allows ONE
 * privileged operation: updating the user's password.
 *
 * We don't need to extract the token ourselves — calling
 * `supabase.auth.updateUser({ password })` works as long as the token
 * is in the URL. If the URL doesn't contain a valid token, the call
 * returns an error and we show "this link is invalid or expired".
 */
export function ResetPasswordForm({ labels }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [hasValidToken, setHasValidToken] = useState(false)

  // On mount: check whether Supabase picked up a valid recovery session
  // from the URL hash. If not, the user got here without clicking a
  // password-reset link (or the link expired) and we should tell them.
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: sessErr } = await supabase.auth.getSession()
        if (cancelled) return
        if (sessErr) {
          console.error('Session check error:', sessErr)
          setHasValidToken(false)
        } else {
          // A valid recovery session exists if there's a current user
          // AND we arrived via a recovery flow. Supabase 2.x exposes the
          // session.user.aud and access_token presence is enough for the
          // common case.
          setHasValidToken(data.session !== null)
        }
      } finally {
        setTokenChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        labels.errorTooShort.replace('{min}', String(MIN_PASSWORD_LENGTH))
      )
      return
    }
    if (password !== confirm) {
      setError(labels.errorMismatch)
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: supabaseError } = await supabase.auth.updateUser({
        password,
      })
      if (supabaseError) {
        console.error('Password update error:', supabaseError)
        // The most common cause of failure here is an expired/invalid
        // recovery token. Show the token-specific message.
        setError(labels.errorTokenInvalid)
        setSubmitting(false)
        return
      }
      setSubmitted(true)
      setSubmitting(false)
    } catch (err) {
      console.error('Password update crashed:', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  if (!tokenChecked) {
    return (
      <div className="text-sm text-muted-foreground italic">…</div>
    )
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-green-200 bg-green-50 text-green-900 p-4 text-sm">
          {labels.successMessage}
        </div>
        <Button className="w-full" onClick={() => router.push('/')}>
          {labels.goToApp}
        </Button>
      </div>
    )
  }

  if (!hasValidToken) {
    return (
      <div className="rounded-md border border-destructive bg-destructive/5 text-destructive p-4 text-sm">
        {labels.errorTokenInvalid}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{labels.passwordLabel}</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={submitting}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">{labels.confirmLabel}</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={submitting}
          autoComplete="new-password"
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

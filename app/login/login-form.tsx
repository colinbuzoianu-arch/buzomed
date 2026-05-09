'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LoginFormProps = {
  labels: {
    emailLabel: string
    emailPlaceholder: string
    passwordLabel: string
    submitButton: string
    submitting: string
    errorInvalid: string
    errorGeneric: string
    /** Banner shown when arriving from accept-invite flow */
    acceptedBanner?: string
  }
}

export function LoginForm({ labels }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAcceptedBanner, setShowAcceptedBanner] = useState(false)

  // On mount: read email + accepted flag from query params (set by the
  // accept-invite redirect). We only set initial state once — subsequent
  // edits by the user shouldn't be overwritten.
  useEffect(() => {
    const emailParam = searchParams.get('email')
    const acceptedParam = searchParams.get('accepted')
    if (emailParam) setEmail(emailParam)
    if (acceptedParam === '1' && labels.acceptedBanner) {
      setShowAcceptedBanner(true)
    }
    // Intentionally only depend on labels, not searchParams — we want
    // this to run once on mount, not whenever query params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(
          authError.message.toLowerCase().includes('invalid')
            ? labels.errorInvalid
            : labels.errorGeneric
        )
        setIsSubmitting(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(labels.errorGeneric)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showAcceptedBanner && labels.acceptedBanner && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
          {labels.acceptedBanner}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">{labels.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          placeholder={labels.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isSubmitting}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{labels.passwordLabel}</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isSubmitting}
          autoComplete="current-password"
          autoFocus={!!email}
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? labels.submitting : labels.submitButton}
      </Button>
    </form>
  )
}

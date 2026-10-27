'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

/**
 * Second step of login for users who have enrolled 2FA. Reached after the
 * password step leaves the session at AAL1 with AAL2 required. On success the
 * session is elevated to AAL2 and we continue to the normal post-login landing
 * ('/', which redirects by role exactly as before). Users without 2FA never
 * see this page.
 */

interface Labels {
  codeLabel: string
  codePlaceholder: string
  deviceLabel: string
  submitButton: string
  submitting: string
  errorInvalid: string
  errorGeneric: string
  errorLocked: string
  logoutLink: string
  loading: string
}

// Client-side guard on top of Supabase's own rate limiting.
const MAX_ATTEMPTS = 5

export function LoginTwoFactorForm({ labels }: { labels: Labels }) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState<Array<{ id: string; name: string }>>([])
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const locked = attempts >= MAX_ATTEMPTS

  const init = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal) {
      router.replace('/login')
      return
    }
    // Already fully elevated, or never needed a second factor → go home.
    if (aal.currentLevel === 'aal2' || aal.nextLevel !== 'aal2') {
      router.replace('/')
      return
    }
    const { data: list } = await supabase.auth.mfa.listFactors()
    const totp = list?.totp ?? []
    if (totp.length === 0) {
      router.replace('/')
      return
    }
    setFactors(totp.map((f) => ({ id: f.id, name: f.friendly_name ?? 'TOTP' })))
    setFactorId(totp[0].id)
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    void init()
  }, [init])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (locked || !factorId) return
    setError(null)
    setSubmitting(true)
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr || !challenge) {
        setError(labels.errorGeneric)
        setSubmitting(false)
        return
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyErr) {
        const next = attempts + 1
        setAttempts(next)
        // Record the failed attempt in the audit log (allowed at AAL1 by the
        // middleware whitelist). Fire-and-forget.
        void fetch('/api/account/mfa/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'failed' }),
        }).catch(() => {})
        setError(next >= MAX_ATTEMPTS ? labels.errorLocked : labels.errorInvalid)
        setCode('')
        setSubmitting(false)
        return
      }
      // Elevated to AAL2 — continue exactly like the password step did.
      router.push('/')
      router.refresh()
    } catch {
      setError(labels.errorGeneric)
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{labels.loading}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {factors.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="factor">{labels.deviceLabel}</Label>
          <select
            id="factor"
            value={factorId}
            onChange={(e) => setFactorId(e.target.value)}
            disabled={submitting || locked}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="code">{labels.codeLabel}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder={labels.codePlaceholder}
          disabled={submitting || locked}
          autoFocus
          className="tracking-widest text-lg"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting || locked || code.trim().length !== 6}>
        {submitting ? labels.submitting : labels.submitButton}
      </Button>

      <div className="text-center text-sm">
        <button
          type="button"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-foreground"
        >
          {labels.logoutLink}
        </button>
      </div>
    </form>
  )
}

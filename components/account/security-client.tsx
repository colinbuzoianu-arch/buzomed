'use client'

import { ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_TOTP_FACTORS } from '@/lib/mfa'
import { createClient } from '@/lib/supabase/client'

/**
 * Account security page: optional two-factor authentication (TOTP) management.
 *
 * All MFA mutations go through the Supabase browser client (supabase.auth.mfa.*)
 * on the user's own session. 2FA is never forced: a user with no factor simply
 * sees the "activate" call to action. Once a factor is verified, the code is
 * required at every login (enforced by the middleware + requireUser gate).
 *
 * Audit entries (enabled / disabled) are written by POSTing to
 * /api/account/mfa/event — the audit log lives in Postgres, not Supabase Auth.
 */

export interface SecurityLabels {
  title: string
  intro: string
  statusActive: string
  statusInactive: string
  devicesTitle: string
  addedOn: string
  removeButton: string
  removeHelp: string
  removeCodeLabel: string
  removeConfirm: string
  removeCancel: string
  addButton: string
  activateButton: string
  deviceNameLabel: string
  deviceNamePlaceholder: string
  deviceNameDefault: string
  generateButton: string
  scanHelp: string
  secretLabel: string
  codeLabel: string
  codePlaceholder: string
  confirmButton: string
  cancelButton: string
  maxReached: string
  recommendSecond: string
  appsHelp: string
  lostPhoneHelp: string
  errorInvalidCode: string
  errorGeneric: string
  errorNameExists: string
  successEnabled: string
  successDisabled: string
  busyGenerating: string
  busyVerifying: string
  busyRemoving: string
  loading: string
}

interface VerifiedFactor {
  id: string
  name: string
  createdAt: string
}

/** Supabase returns either a full data: URL or a bare SVG string. */
function qrToSrc(qr: string): string {
  if (qr.startsWith('data:')) return qr
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`
}

function logEvent(event: 'enabled' | 'disabled') {
  // Fire-and-forget: audit must never block or break the UI.
  void fetch('/api/account/mfa/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {})
}

export function SecurityClient({ labels, locale }: { labels: SecurityLabels; locale: 'ro' | 'en' }) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState<VerifiedFactor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Enrollment state
  const [enrollName, setEnrollName] = useState('')
  const [enrolling, setEnrolling] = useState(false) // name-entry → QR shown
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // Removal state (per factor): the factor currently being removed + its code
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeCode, setRemoveCode] = useState('')

  const loadFactors = useCallback(async () => {
    const { data, error: listErr } = await supabase.auth.mfa.listFactors()
    if (listErr || !data) {
      setLoading(false)
      return
    }
    // Clean up any abandoned, never-verified factors from a previous attempt.
    const stale = data.all.filter((f) => f.status === 'unverified')
    await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})))
    setFactors(
      data.totp.map((f) => ({
        id: f.id,
        name: f.friendly_name ?? 'TOTP',
        createdAt: f.created_at,
      }))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadFactors()
  }, [loadFactors])

  function resetEnroll() {
    setEnrolling(false)
    setEnrollFactorId(null)
    setQr(null)
    setSecret(null)
    setCode('')
    setEnrollName('')
  }

  async function beginEnroll() {
    setError(null)
    setSuccess(null)
    if (factors.length >= MAX_TOTP_FACTORS) {
      setError(labels.maxReached)
      return
    }
    setEnrollName(labels.deviceNameDefault)
    setEnrolling(true)
  }

  async function generateQr() {
    setError(null)
    setBusy('generate')
    const friendlyName = enrollName.trim() || labels.deviceNameDefault
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    })
    setBusy(null)
    if (enrollErr || !data) {
      setError(
        enrollErr?.message.toLowerCase().includes('friendly')
          ? labels.errorNameExists
          : labels.errorGeneric
      )
      return
    }
    setEnrollFactorId(data.id)
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
  }

  async function confirmEnroll() {
    if (!enrollFactorId) return
    setError(null)
    setBusy('verify')
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: enrollFactorId,
    })
    if (chErr || !challenge) {
      setBusy(null)
      setError(labels.errorGeneric)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollFactorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    setBusy(null)
    if (verifyErr) {
      setError(labels.errorInvalidCode)
      return
    }
    logEvent('enabled')
    resetEnroll()
    setSuccess(labels.successEnabled)
    await loadFactors()
  }

  async function cancelEnroll() {
    // Drop the just-created unverified factor so it doesn't linger.
    if (enrollFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrollFactorId }).catch(() => {})
    }
    resetEnroll()
    setError(null)
  }

  async function confirmRemove(factorId: string) {
    setError(null)
    setBusy('remove')
    // Require a fresh code: challenge + verify proves possession and elevates
    // the session to AAL2, which Supabase requires before unenroll.
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr || !challenge) {
      setBusy(null)
      setError(labels.errorGeneric)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: removeCode.trim(),
    })
    if (verifyErr) {
      setBusy(null)
      setError(labels.errorInvalidCode)
      return
    }
    const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(null)
    if (unErr) {
      setError(labels.errorGeneric)
      return
    }
    logEvent('disabled')
    setRemovingId(null)
    setRemoveCode('')
    setSuccess(labels.successDisabled)
    await loadFactors()
  }

  const dateFmt = new Intl.DateTimeFormat(locale === 'ro' ? 'ro-RO' : 'en-GB', {
    dateStyle: 'medium',
  })

  const isActive = factors.length > 0

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">{labels.title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{labels.intro}</p>
      </div>

      {/* Status banner */}
      <div
        className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
          isActive
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
        }`}
      >
        {isActive ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldOff className="h-4 w-4 shrink-0" />}
        <span>{isActive ? labels.statusActive : labels.statusInactive}</span>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900">
          {success}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{labels.loading}</p>
      ) : (
        <>
          {/* Verified factors */}
          {factors.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">{labels.devicesTitle}</h2>
              <ul className="border rounded-lg divide-y">
                {factors.map((f) => (
                  <li key={f.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {labels.addedOn} {dateFmt.format(new Date(f.createdAt))}
                        </p>
                      </div>
                      {removingId !== f.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRemovingId(f.id)
                            setRemoveCode('')
                            setError(null)
                            setSuccess(null)
                          }}
                          disabled={busy !== null}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          {labels.removeButton}
                        </Button>
                      )}
                    </div>
                    {removingId === f.id && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <p className="text-xs text-muted-foreground">{labels.removeHelp}</p>
                        <Label htmlFor={`rm-${f.id}`}>{labels.removeCodeLabel}</Label>
                        <Input
                          id={`rm-${f.id}`}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={removeCode}
                          onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, ''))}
                          className="max-w-[160px] tracking-widest"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void confirmRemove(f.id)}
                            disabled={busy !== null || removeCode.trim().length !== 6}
                          >
                            {busy === 'remove' ? labels.busyRemoving : labels.removeConfirm}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRemovingId(null)
                              setRemoveCode('')
                            }}
                            disabled={busy !== null}
                          >
                            {labels.removeCancel}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {factors.length < MAX_TOTP_FACTORS && (
                <p className="text-xs text-muted-foreground">{labels.recommendSecond}</p>
              )}
            </div>
          )}

          {/* Enrollment */}
          {!enrolling && factors.length < MAX_TOTP_FACTORS && (
            <Button onClick={() => void beginEnroll()} disabled={busy !== null}>
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              {isActive ? labels.addButton : labels.activateButton}
            </Button>
          )}
          {!enrolling && factors.length >= MAX_TOTP_FACTORS && (
            <p className="text-xs text-muted-foreground">{labels.maxReached}</p>
          )}

          {enrolling && (
            <div className="border rounded-lg p-4 space-y-4">
              {!qr ? (
                <div className="space-y-2">
                  <Label htmlFor="device-name">{labels.deviceNameLabel}</Label>
                  <Input
                    id="device-name"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    placeholder={labels.deviceNamePlaceholder}
                    maxLength={40}
                    className="max-w-sm"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => void generateQr()} disabled={busy !== null}>
                      {busy === 'generate' ? labels.busyGenerating : labels.generateButton}
                    </Button>
                    <Button variant="ghost" onClick={() => void cancelEnroll()} disabled={busy !== null}>
                      {labels.cancelButton}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm">{labels.scanHelp}</p>
                  <Image
                    src={qrToSrc(qr)}
                    alt="QR"
                    width={180}
                    height={180}
                    unoptimized
                    className="rounded border bg-white p-2"
                  />
                  {secret && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{labels.secretLabel}</p>
                      <code className="block text-sm font-mono bg-muted rounded px-2 py-1 break-all">
                        {secret}
                      </code>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="enroll-code">{labels.codeLabel}</Label>
                    <Input
                      id="enroll-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder={labels.codePlaceholder}
                      className="max-w-[160px] tracking-widest"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void confirmEnroll()}
                      disabled={busy !== null || code.trim().length !== 6}
                    >
                      {busy === 'verify' ? labels.busyVerifying : labels.confirmButton}
                    </Button>
                    <Button variant="ghost" onClick={() => void cancelEnroll()} disabled={busy !== null}>
                      {labels.cancelButton}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Help */}
          <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
            <p>{labels.appsHelp}</p>
            <p>{labels.lostPhoneHelp}</p>
          </div>
        </>
      )}
    </div>
  )
}

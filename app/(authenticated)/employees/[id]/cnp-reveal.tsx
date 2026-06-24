'use client'

import { useState } from 'react'

/**
 * Small client component to toggle CNP display between masked and full.
 *
 * The plaintext CNP is already in the component's props (decrypted by
 * the parent server component when the actor has permission). The
 * toggle is purely a visual on/off — no API call. This means an
 * attacker with the page HTML and dev tools can read the full CNP if
 * the parent decided to send it; that's the same as if we always
 * displayed it. The masking is a UX nicety to avoid shoulder-surfing.
 *
 * When the actor lacks PII permission, `plaintext` is null and we
 * render only the masked text; the button is hidden.
 *
 * When `decryptError` is true (actor has permission but the ciphertext
 * is corrupt / key-rotated), we render an amber warning prompting
 * re-entry instead of an ambiguous mask.
 */

interface Props {
  masked: string
  plaintext: string | null
  decryptError?: boolean
  revealLabel: string
  hideLabel: string
  noPermissionLabel: string
  decryptErrorLabel?: string
}

export function CnpReveal({
  masked,
  plaintext,
  decryptError = false,
  revealLabel,
  hideLabel,
  noPermissionLabel,
  decryptErrorLabel,
}: Props) {
  const [revealed, setRevealed] = useState(false)

  if (!plaintext) {
    if (decryptError) {
      return (
        <span className="inline-flex items-center gap-2 text-amber-600 text-sm">
          <span aria-hidden>⚠</span>
          <span>{decryptErrorLabel ?? 'CNP cannot be read — please re-enter.'}</span>
        </span>
      )
    }
    // No permission — show neutral mask
    return (
      <span className="inline-flex items-center gap-3">
        <span className="font-mono text-muted-foreground">{masked}</span>
        <span className="text-xs text-muted-foreground">
          {noPermissionLabel}
        </span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-3">
      <span className="font-mono">{revealed ? plaintext : masked}</span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-xs text-primary hover:underline"
      >
        {revealed ? hideLabel : revealLabel}
      </button>
    </span>
  )
}

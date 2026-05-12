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
 */

interface Props {
  masked: string
  plaintext: string | null
  revealLabel: string
  hideLabel: string
  noPermissionLabel: string
}

export function CnpReveal({
  masked,
  plaintext,
  revealLabel,
  hideLabel,
  noPermissionLabel,
}: Props) {
  const [revealed, setRevealed] = useState(false)

  if (!plaintext) {
    // Either no CNP stored or actor isn't authorized.
    return (
      <span className="inline-flex items-center gap-3">
        <span className="font-mono">{masked}</span>
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

'use client'

import { useState, useEffect } from 'react'

export function CookieNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('cookie-notice-dismissed')
    if (!dismissed) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem('cookie-notice-dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border bg-card shadow-lg p-4 space-y-3">
      <p className="text-[13px] text-foreground leading-relaxed">
        Buzomed folosește cookie-uri tehnice strict necesare pentru autentificare și
        funcționarea platformei. Nu folosim cookie-uri de tracking sau publicitate.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={dismiss}
          className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          Am înțeles
        </button>
        <a
          href="/privacy"
          className="flex-1 h-8 rounded-md border text-center flex items-center justify-center text-[13px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Mai mult
        </a>
      </div>
    </div>
  )
}

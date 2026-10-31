'use client'

import { useState, useEffect } from 'react'
import { setAnalyticsConsent } from './ga-loader'

export function CookieNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only surface the banner when the visitor hasn't chosen yet. A prior
    // 'granted' choice is already re-applied by GaLoader's inline snippet,
    // so there's nothing to do here for returning visitors.
    const consent = localStorage.getItem('cookie-consent')
    if (!consent) {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem('cookie-consent', 'granted')
    setAnalyticsConsent(true)
    setVisible(false)
  }

  function deny() {
    localStorage.setItem('cookie-consent', 'denied')
    setAnalyticsConsent(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border bg-card shadow-lg p-4 space-y-3">
      <p className="text-[13px] text-foreground leading-relaxed">
        Buzomed folosește cookie-uri tehnice strict necesare pentru funcționarea platformei.
        Pe paginile publice folosim Google Analytics: cu acordul dumneavoastră, pentru statistici
        detaliate cu cookie-uri; dacă refuzați, doar măsurare anonimă agregată, fără cookie-uri.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={accept}
          className="h-8 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          Accept cookie-uri analitice
        </button>
        <button
          onClick={deny}
          className="h-8 rounded-md border text-[13px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Continuă fără analytics
        </button>
      </div>
      <a
        href="/privacy"
        className="block text-center text-[13px] text-muted-foreground hover:underline"
      >
        Mai mult
      </a>
    </div>
  )
}

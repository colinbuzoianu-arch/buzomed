'use client'

import { useState, useEffect } from 'react'
import { loadGA } from './ga-loader'

export function CookieNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent')
    if (consent === 'granted') {
      loadGA()
    } else if (!consent) {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem('cookie-consent', 'granted')
    loadGA()
    setVisible(false)
  }

  function deny() {
    localStorage.setItem('cookie-consent', 'denied')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border bg-card shadow-lg p-4 space-y-3">
      <p className="text-[13px] text-foreground leading-relaxed">
        Buzomed folosește cookie-uri tehnice strict necesare pentru funcționarea platformei.
        Folosim și Google Analytics pentru măsurarea anonimă a traficului pe paginile publice,
        doar cu acordul dumneavoastră.
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

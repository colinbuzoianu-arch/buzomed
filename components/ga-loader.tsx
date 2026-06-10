'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'

const GA_ID = 'G-J0306LBB42'
let gaInitiated = false

// Called imperatively (cookie accept or mount-if-granted).
// Dispatches a custom event so GaLoader renders the <Script> tag via next/script.
export function loadGA() {
  if (typeof window === 'undefined') return
  if (gaInitiated) return
  gaInitiated = true
  window.dispatchEvent(new Event('ga-consent-granted'))
}

export function GaLoader() {
  const [load, setLoad] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('cookie-consent') === 'granted') {
      setLoad(true)
    }
    const handler = () => setLoad(true)
    window.addEventListener('ga-consent-granted', handler)
    return () => window.removeEventListener('ga-consent-granted', handler)
  }, [])

  if (!load || process.env.NODE_ENV !== 'production') return null

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      strategy="afterInteractive"
      onLoad={() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        w.dataLayer = w.dataLayer || []
        w.gtag = w.gtag || function (...a: unknown[]) { w.dataLayer.push(a) }
        w.gtag('js', new Date())
        w.gtag('config', GA_ID)
      }}
    />
  )
}

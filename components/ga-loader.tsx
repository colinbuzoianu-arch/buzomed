'use client'

import Script from 'next/script'

const GA_ID = 'G-J0306LBB42'

/**
 * Updates Google consent state after the visitor makes a choice in the
 * cookie banner. Safe to call before gtag.js has finished loading: it
 * pushes onto the dataLayer queue, which the library replays on load.
 *
 * Granting flips `analytics_storage` to 'granted' (GA may now set its
 * first-party cookies and collect full statistics). Denying keeps it
 * 'denied' — under Consent Mode v2 GA still sends anonymous, cookieless
 * pings for aggregate/modeled traffic, so we measure every visitor
 * without storing anything on their device and without their consent.
 */
export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  w.dataLayer = w.dataLayer || []
  w.gtag = w.gtag || ((...a: unknown[]) => w.dataLayer.push(a))
  w.gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
  })
}

/**
 * Loads Google Analytics on every public-page visit (production only)
 * using Consent Mode v2. Consent for analytics storage defaults to
 * 'denied', so until the visitor accepts, GA runs cookielessly: no
 * cookies are written, but anonymous aggregate pings are still sent.
 * Ad-related consent is denied and never granted — we only measure
 * traffic, we don't advertise.
 *
 * If the visitor previously accepted (persisted in localStorage), the
 * inline snippet upgrades analytics consent to 'granted' immediately so
 * full statistics resume without waiting for another banner interaction.
 */
export function GaLoader() {
  if (process.env.NODE_ENV !== 'production') return null

  return (
    <>
      <Script id="ga-consent-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied'
          });
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
          try {
            if (localStorage.getItem('cookie-consent') === 'granted') {
              gtag('consent', 'update', { 'analytics_storage': 'granted' });
            }
          } catch (e) {}
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
    </>
  )
}

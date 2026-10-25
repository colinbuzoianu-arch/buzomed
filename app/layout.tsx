import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Manrope } from 'next/font/google'
import { CookieNotice } from '@/components/cookie-notice'
import { Toaster } from '@/components/ui/sonner'
import { getLocale } from '@/lib/i18n'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-manrope',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-fraunces',
  weight: ['300', '400', '500'],
  display: 'swap',
})

/**
 * Root metadata. The icon array lets Next.js emit <link rel="icon">
 * tags for the various sizes, plus an apple-touch-icon for iOS
 * home-screen pinning.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Buzomed — Software și platformă pentru medicina muncii',
    template: '%s | Buzomed',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'software medicina muncii',
    'platforma medicina muncii',
    'program medicina muncii',
    'aplicatie medicina muncii',
    'fisa de aptitudine',
    'cabinet medicina muncii',
    'HG 355/2007',
  ],
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: SITE_NAME,
    url: SITE_URL,
    title: 'Buzomed — Software și platformă pentru medicina muncii',
    description: SITE_DESCRIPTION,
    images: [{ url: '/buzomed_picture.jpg', width: 1920, height: 1080, alt: 'Buzomed — software medicina muncii' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Buzomed — Software și platformă pentru medicina muncii',
    description: SITE_DESCRIPTION,
    images: ['/buzomed_picture.jpg'],
  },
  // Google Search Console HTML-tag verification. Set the token in Vercel
  // as GOOGLE_SITE_VERIFICATION (just the content="…" value).
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

/**
 * Mobile viewport configuration. `maximumScale: 1` keeps form inputs
 * from auto-zooming on iOS Safari (which would otherwise make the page
 * un-pannable until the user manually zooms back out). `viewportFit:
 * cover` lets the app paint into the iPhone notch area.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e3a8a', // matches the deep blue in the logo
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="bottom-right" richColors />
        <CookieNotice />
        <SpeedInsights />
      </body>
    </html>
  )
}

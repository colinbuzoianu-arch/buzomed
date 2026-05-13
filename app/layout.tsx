import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { getLocale } from '@/lib/i18n'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

/**
 * Root metadata. The icon array lets Next.js emit <link rel="icon">
 * tags for the various sizes, plus an apple-touch-icon for iOS
 * home-screen pinning.
 */
export const metadata: Metadata = {
  title: 'Buzomed',
  description: 'Occupational Health. Healthy Workplaces.',
  applicationName: 'Buzomed',
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
    <html lang={locale}>
      <body className={inter.className}>{children}</body>
    </html>
  )
}

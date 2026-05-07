import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { getLocale } from '@/lib/i18n'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Buzomed',
  description: 'Occupational Health. Healthy Workplaces.',
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

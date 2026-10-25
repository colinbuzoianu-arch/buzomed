import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export default function RegisterPage() {
  redirect('/contact')
}

export const metadata: Metadata = {
  title: 'Înregistrare',
  robots: { index: false, follow: false },
}

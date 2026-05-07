'use client'

import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

type Props = {
  currentLocale: Locale
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const router = useRouter()

  function setLocale(locale: Locale) {
    document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    router.refresh()
  }

  return (
    <div className="flex gap-1 text-sm">
      <Button
        variant={currentLocale === 'ro' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setLocale('ro')}
      >
        RO
      </Button>
      <Button
        variant={currentLocale === 'en' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setLocale('en')}
      >
        EN
      </Button>
    </div>
  )
}

import { cookies } from 'next/headers'
import roMessages from '@/messages/ro.json'
import enMessages from '@/messages/en.json'

export type Locale = 'ro' | 'en'
export const DEFAULT_LOCALE: Locale = 'ro'
export const LOCALES: Locale[] = ['ro', 'en']

const messages = {
  ro: roMessages,
  en: enMessages,
} as const

/**
 * Reads the user's preferred locale from a cookie (server-side).
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get('locale')?.value
  if (cookieValue && LOCALES.includes(cookieValue as Locale)) {
    return cookieValue as Locale
  }
  return DEFAULT_LOCALE
}

/**
 * Translation function. Use like t('login.title').
 */
export function getTranslator(locale: Locale) {
  return (key: string): string => {
    const parts = key.split('.')
    let value: unknown = messages[locale]
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part]
      } else {
        return key // fallback: return the key itself
      }
    }
    return typeof value === 'string' ? value : key
  }
}

export type Translator = ReturnType<typeof getTranslator>

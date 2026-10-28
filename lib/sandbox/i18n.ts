import roMessages from '@/messages/ro.json'

/**
 * Client-safe Romanian translator for the sandbox.
 *
 * The app's real translator (lib/i18n) imports next/headers (cookies), which
 * can't be used in a client component. The sandbox is Romanian-only and its
 * interactive pages are client components, so this reads messages/ro.json
 * directly with the same dotted-key lookup and key-fallback behaviour.
 */
export function sandboxT(key: string): string {
  const parts = key.split('.')
  let value: unknown = roMessages
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof value === 'string' ? value : key
}

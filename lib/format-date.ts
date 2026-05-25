/**
 * Centralized date/time formatting.
 *
 * Replaces ad-hoc `new Intl.DateTimeFormat(...)` calls scattered across the app.
 * Server- and client-safe.
 *
 * Do NOT use these utilities in PDF generation routes (app/api/examinations/[id]/**).
 * Those have their own formatDateRo and must stay byte-stable.
 */

export type DateStyle =
  | 'short'      // 23.05.2026
  | 'medium'     // 23 mai 2026
  | 'long'       // joi, 23 mai 2026
  | 'datetime'   // 23 mai 2026, 14:30
  | 'time'       // 14:30
  | 'iso'        // 2026-05-23 (machine-readable, e.g. date inputs)
  | 'relative'   // acum 3 zile / in 2 weeks

export type SupportedLocale = 'ro' | 'en'

type DateLike = Date | string | number | null | undefined

function toDate(value: DateLike): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function bcp47(locale: SupportedLocale): string {
  return locale === 'ro' ? 'ro-RO' : 'en-GB'
}

/**
 * Format a date/datetime according to a named style.
 *
 * @param value Date, ISO string, timestamp, or null/undefined.
 * @param style See DateStyle. Defaults to 'medium'.
 * @param locale 'ro' or 'en'. Defaults to 'ro'.
 * @returns Formatted string, or '—' for null/invalid input.
 */
export function formatDate(
  value: DateLike,
  style: DateStyle = 'medium',
  locale: SupportedLocale = 'ro'
): string {
  const date = toDate(value)
  if (!date) return '—'

  if (style === 'iso') {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (style === 'relative') {
    return formatRelative(date, locale)
  }

  const optsMap: Record<Exclude<DateStyle, 'iso' | 'relative'>, Intl.DateTimeFormatOptions> = {
    short:    { day: '2-digit', month: '2-digit', year: 'numeric' },
    medium:   { day: 'numeric', month: 'long',    year: 'numeric' },
    long:     { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    datetime: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    time:     { hour: '2-digit', minute: '2-digit' },
  }

  const opts = optsMap[style]
  return new Intl.DateTimeFormat(bcp47(locale), opts).format(date)
}

/**
 * Relative time: "acum 3 zile", "in 2 ore", "acum o lună".
 * Uses Intl.RelativeTimeFormat with sensible thresholds.
 */
function formatRelative(date: Date, locale: SupportedLocale): string {
  const now = Date.now()
  const diffMs = date.getTime() - now
  const absMs = Math.abs(diffMs)

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day

  const rtf = new Intl.RelativeTimeFormat(bcp47(locale), { numeric: 'auto' })

  if (absMs < minute) {
    return locale === 'ro' ? 'acum' : 'just now'
  }
  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), 'minute')
  }
  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), 'hour')
  }
  if (absMs < week) {
    return rtf.format(Math.round(diffMs / day), 'day')
  }
  if (absMs < month) {
    return rtf.format(Math.round(diffMs / week), 'week')
  }
  if (absMs < year) {
    return rtf.format(Math.round(diffMs / month), 'month')
  }
  return rtf.format(Math.round(diffMs / year), 'year')
}

/**
 * Convenience: format a date range as "23 mai – 5 iunie 2026" (medium style).
 * Collapses same year, same month sensibly.
 */
export function formatDateRange(
  from: DateLike,
  to: DateLike,
  locale: SupportedLocale = 'ro'
): string {
  const a = toDate(from)
  const b = toDate(to)
  if (!a && !b) return '—'
  if (a && !b) return formatDate(a, 'medium', locale)
  if (!a && b) return formatDate(b, 'medium', locale)
  const sameYear = a!.getFullYear() === b!.getFullYear()
  const sameMonth = sameYear && a!.getMonth() === b!.getMonth()
  const dash = ' – '

  if (sameMonth) {
    const day1 = a!.getDate()
    const tail = new Intl.DateTimeFormat(bcp47(locale), {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(b!)
    return `${day1}${dash}${tail}`
  }
  if (sameYear) {
    const head = new Intl.DateTimeFormat(bcp47(locale), {
      day: 'numeric', month: 'long',
    }).format(a!)
    const tail = new Intl.DateTimeFormat(bcp47(locale), {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(b!)
    return `${head}${dash}${tail}`
  }
  return `${formatDate(a, 'medium', locale)}${dash}${formatDate(b, 'medium', locale)}`
}

/**
 * Hook-free convenience for client components: format date according to user locale.
 * For server components, pass the locale from getLocale().
 */
export function formatDateAuto(value: DateLike, style: DateStyle = 'medium'): string {
  const locale: SupportedLocale =
    typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'ro'
  return formatDate(value, style, locale)
}

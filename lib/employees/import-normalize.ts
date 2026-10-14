/**
 * Shared, dependency-free normalization helpers for the employee bulk
 * import. Imported by BOTH the client-side parser
 * (`lib/employees/import-parser.ts`, runs in the browser) and the
 * server-side routes (`app/api/employees/import/{diff,commit}`). Keep it
 * free of any Node-only or browser-only API so it bundles cleanly on both
 * sides — pure string/date logic only.
 */

/**
 * Normalizes a workplace / department label so that cosmetic differences
 * collapse to the same value. Real HR exports are inconsistent: trailing
 * spaces, double spaces, a stray full stop at the end. Without this,
 * "SECTOR DISTRIBUTIE APA " and "SECTOR DISTRIBUTIE APA." would create two
 * distinct workplaces.
 *
 * Returns the cleaned value suitable BOTH for display/storage and, when
 * lower-cased by the caller, for equality comparison.
 */
export function normalizeWorkplaceValue(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '') // drop a trailing full stop (and any space before it)
    .trim()
}

/** Lower-cased comparison key for workplace/department matching. */
export function workplaceKey(raw: string): string {
  return normalizeWorkplaceValue(raw).toLowerCase()
}

/**
 * Normalizes a raw CNP value coming from a spreadsheet cell.
 *
 * Handles the two things real files do to CNPs:
 *   - trailing/leading or embedded spaces ("1850315 120030")
 *   - Excel storing them as numbers. A 13-digit CNP (max 9.99e12) is well
 *     within JS's safe-integer range (~9.0e15), so `String(n)` never uses
 *     scientific notation; we still defend against an accidental "e"/"E"
 *     by rejecting anything non-numeric downstream via validateCnp.
 *
 * We deliberately do NOT pad or "fix" the value — a 12-digit CNP must be
 * surfaced as invalid, not silently zero-filled (see import spec §1).
 */
export function normalizeCnpInput(raw: string): string {
  return raw.replace(/[\s.-]/g, '')
}

export type FlexibleDateResult =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'valid'; date: Date }

/**
 * Parses a date from the messy set of formats real client files use:
 *
 *   - native Excel date already stringified to ISO ("yyyy-mm-dd")
 *   - "dd.mm.yyyy", "dd/mm/yyyy", "dd-mm-yyyy"
 *   - "yyyy/mm/dd"
 *   - a 5-digit Excel serial number (fallback, when `cellDates` didn't
 *     kick in) — the 1899-12-30 epoch Excel uses on all modern platforms.
 *
 * Returns a UTC-midnight Date so downstream date-only columns
 * (`startDate`, `dueDate`, both `@db.Date`) are timezone-stable.
 *
 * A bare 4-digit number (e.g. "2027") is treated as INVALID rather than a
 * serial — in real files it is a stray year/separator cell, and a serial
 * for any realistic date is 5 digits. Future-vs-past is NOT decided here;
 * the caller applies that rule (a hire date in the future is a warning, a
 * fitness-certificate expiry in the future is normal).
 */
export function parseFlexibleDate(raw: string | null | undefined): FlexibleDateResult {
  if (raw == null) return { status: 'empty' }
  const s = String(raw).trim()
  if (s === '') return { status: 'empty' }

  let ymd: { year: number; month: number; day: number } | null = null

  // ISO or yyyy/mm/dd (year first, 4-digit year)
  let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (m) {
    ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  } else {
    // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy (day first, 4-digit year)
    m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
    if (m) {
      ymd = { year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) }
    }
  }

  if (ymd === null) {
    // Excel serial fallback — only a 5-digit integer in a plausible range
    // (≈ 1927-01-01 … 2089). 4-digit values are stray years, not serials.
    if (/^\d{5}$/.test(s)) {
      const serial = Number(s)
      if (serial >= 10000 && serial <= 80000) {
        // Excel's epoch is 1899-12-30 (accounting for its 1900 leap-year bug).
        const ms = Date.UTC(1899, 11, 30) + serial * 86400000
        const d = new Date(ms)
        if (!Number.isNaN(d.getTime())) return { status: 'valid', date: d }
      }
    }
    return { status: 'invalid' }
  }

  const { year, month, day } = ymd
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { status: 'invalid' }
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  // Round-trip check catches impossible dates (e.g. 31.02.2025 → March).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { status: 'invalid' }
  }
  return { status: 'valid', date }
}

/** True when the given date is strictly after today (UTC day granularity). */
export function isFutureDate(date: Date): boolean {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return date.getTime() > today.getTime()
}

// Romanian + English month names (and common abbreviations), diacritics
// already stripped, for the split-column date format (ZIUA/LUNA/ANUL EXP.)
// some HR exports use — e.g. the APAPROD file.
const MONTH_NAMES: Record<string, number> = {
  ianuarie: 1,
  ian: 1,
  january: 1,
  jan: 1,
  februarie: 2,
  feb: 2,
  february: 2,
  martie: 3,
  mar: 3,
  march: 3,
  aprilie: 4,
  apr: 4,
  april: 4,
  mai: 5,
  may: 5,
  iunie: 6,
  iun: 6,
  june: 6,
  jun: 6,
  iulie: 7,
  iul: 7,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  septembrie: 9,
  sep: 9,
  sept: 9,
  september: 9,
  octombrie: 10,
  oct: 10,
  october: 10,
  noiembrie: 11,
  noi: 11,
  nov: 11,
  november: 11,
  decembrie: 12,
  dec: 12,
  december: 12,
}

function parseMonthPart(raw: string): number | null {
  const s = raw.trim()
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s)
    return n >= 1 && n <= 12 ? n : null
  }
  const key = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '').trim()
  return MONTH_NAMES[key] ?? null
}

function parseYearPart(raw: string): number | null {
  const s = raw.trim()
  if (!/^\d{2}$|^\d{4}$/.test(s)) return null
  const n = Number(s)
  const year = s.length === 2 ? 2000 + n : n
  return year >= 1990 && year <= 2100 ? year : null
}

/**
 * Assembles a date from three separate day / month / year cells (the
 * ZIUA EXP. / LUNA EXP. / ANUL EXP. layout of some HR exports) into a
 * canonical `yyyy-mm-dd` string that `parseFlexibleDate` can consume. The
 * month cell may be numeric or a Romanian/English month name; a 2-digit
 * year is read as 20xx. Returns null when any part is missing or
 * implausible — final impossible-date rejection (e.g. 31.02) is left to
 * `parseFlexibleDate`'s round-trip check.
 */
export function combineDateParts(
  day: string | null | undefined,
  month: string | null | undefined,
  year: string | null | undefined
): string | null {
  if (!day || !month || !year) return null
  const d = day.trim()
  if (!/^\d{1,2}$/.test(d)) return null
  const dn = Number(d)
  if (dn < 1 || dn > 31) return null
  const m = parseMonthPart(month)
  const y = parseYearPart(year)
  if (m === null || y === null) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(dn)}`
}

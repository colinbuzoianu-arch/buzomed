/**
 * Lightweight validators for tenant data API routes.
 *
 * Returns either { ok: true, value } or { ok: false, issues } so callers
 * can surface field-level errors back to the UI without wrapping every
 * field in try/catch. We intentionally don't pull in zod / valibot here:
 * the existing routes (api/invitations, api/tenants) hand-roll their
 * validation in the same style and adding a runtime dep just for two CRUD
 * surfaces isn't worth it. Revisit when there are 5+ surfaces.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] }

/**
 * Returns `value` trimmed if it's a non-empty string after trimming.
 * Pushes an issue and returns undefined otherwise. Use for required strings.
 */
export function requireString(
  field: string,
  value: unknown,
  issues: string[],
  opts: { maxLength?: number } = {}
): string | undefined {
  if (typeof value !== 'string') {
    issues.push(`${field} is required`)
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    issues.push(`${field} is required`)
    return undefined
  }
  if (opts.maxLength && trimmed.length > opts.maxLength) {
    issues.push(`${field} must be at most ${opts.maxLength} characters`)
    return undefined
  }
  return trimmed
}

/**
 * Returns `value` trimmed (or undefined for null/undefined/empty).
 * Use for optional strings. Pushes an issue only if the wrong TYPE is
 * sent — empty strings and missing values are normalized to undefined,
 * which Prisma stores as NULL.
 */
export function optionalString(
  field: string,
  value: unknown,
  issues: string[],
  opts: { maxLength?: number } = {}
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    issues.push(`${field} must be a string`)
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (opts.maxLength && trimmed.length > opts.maxLength) {
    issues.push(`${field} must be at most ${opts.maxLength} characters`)
    return undefined
  }
  return trimmed
}

/**
 * Parses a date-only field (YYYY-MM-DD) into a Date at UTC midnight, or
 * undefined for missing/empty input. Pushes an issue for malformed input.
 *
 * Date-only fields in the schema use @db.Date, so storing UTC midnight
 * round-trips cleanly without timezone drift.
 */
export function optionalDate(
  field: string,
  value: unknown,
  issues: string[]
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    issues.push(`${field} must be an ISO date string (YYYY-MM-DD)`)
    return undefined
  }
  // Accept YYYY-MM-DD; reject anything else to keep callers honest.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issues.push(`${field} must be in YYYY-MM-DD format`)
    return undefined
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (isNaN(parsed.getTime())) {
    issues.push(`${field} is not a valid date`)
    return undefined
  }
  return parsed
}

/**
 * Validates an email if present. Returns the trimmed lowercase email
 * (or undefined if absent). Uses the same loose check as the rest of
 * the codebase — full RFC 5321 validation is the SMTP server's job.
 */
export function optionalEmail(
  field: string,
  value: unknown,
  issues: string[]
): string | undefined {
  const trimmed = optionalString(field, value, issues, { maxLength: 320 })
  if (trimmed === undefined) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    issues.push(`${field} is not a valid email address`)
    return undefined
  }
  return trimmed.toLowerCase()
}

/**
 * Returns the body as a typed Record if it's a plain object, or null
 * otherwise. Centralizes the "is this even an object" check so route
 * handlers stay short.
 */
export function asObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }
  return body as Record<string, unknown>
}

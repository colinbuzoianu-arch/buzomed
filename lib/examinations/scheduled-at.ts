import { optionalDateTime } from '@/lib/validation'

/**
 * Sanity bounds for `Examination.scheduledAt`.
 *
 * These are NOT the same kind of rule as the bounds on `examinedAt` (see
 * lib/examinations/examined-at.ts), and the difference is worth being
 * explicit about:
 *
 *   - `examinedAt` is an integrity constraint on a legal attestation. It
 *     must never be in the future, and deep backdating is refused because
 *     an unbounded date there is an invitation to falsify when a worker was
 *     seen.
 *   - `scheduledAt` is an appointment slot. Future dates are the normal
 *     case, and past ones are legitimate too (entering last week's
 *     appointments retroactively). It carries no attestation, and it is not
 *     printed on the fișă.
 *
 * So the bounds here only exist to catch garbage: a mistyped year, a
 * millisecond timestamp pasted into a date field, a client sending epoch 0.
 * Previously the field accepted any parseable datetime at all, which meant
 * a typo like "2025" → "0225" silently created an appointment eighteen
 * centuries ago and quietly polluted every date-ranged report and recall
 * sweep that touches it.
 *
 * Deliberately generous, because tightening an appointment window would
 * break real scheduling: a year back covers any plausible catch-up data
 * entry, and two years forward covers scheduling against the longest
 * periodic interval a workplace can define.
 */

export const SCHEDULED_AT_MAX_PAST_DAYS = 365
export const SCHEDULED_AT_MAX_FUTURE_DAYS = 730

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface ScheduledAtValidationContext {
  /** Injectable for tests; defaults to now. */
  now?: Date
  /** Prefix for issue messages, e.g. `item[3].scheduledAt` in bulk flows. */
  field?: string
}

/**
 * Parses and bounds-checks an incoming `scheduledAt` value.
 *
 * Accepts any ISO datetime string (appointments carry a time, unlike
 * `examinedAt` which is a plain date) and appends human-readable problems to
 * `issues`, matching the convention in lib/validation.ts.
 *
 * Returns the parsed `Date`, or `undefined` when the value was absent or
 * rejected. Callers treat `undefined` as "no scheduled time", which is the
 * pre-existing behaviour for an omitted field — a rejected value also
 * leaves an entry in `issues`, so it surfaces as a validation error rather
 * than silently becoming null.
 */
export function parseScheduledAt(
  value: unknown,
  issues: string[],
  ctx: ScheduledAtValidationContext = {}
): Date | undefined {
  const field = ctx.field ?? 'scheduledAt'

  const parsed = optionalDateTime(field, value, issues)
  if (!parsed) return undefined

  const now = ctx.now ?? new Date()

  const earliest = new Date(now.getTime() - SCHEDULED_AT_MAX_PAST_DAYS * MS_PER_DAY)
  if (parsed.getTime() < earliest.getTime()) {
    issues.push(`${field} cannot be more than ${SCHEDULED_AT_MAX_PAST_DAYS} days in the past`)
    return undefined
  }

  const latest = new Date(now.getTime() + SCHEDULED_AT_MAX_FUTURE_DAYS * MS_PER_DAY)
  if (parsed.getTime() > latest.getTime()) {
    issues.push(`${field} cannot be more than ${SCHEDULED_AT_MAX_FUTURE_DAYS} days in the future`)
    return undefined
  }

  return parsed
}

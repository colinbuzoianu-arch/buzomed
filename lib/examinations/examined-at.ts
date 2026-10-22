import { optionalDate } from '@/lib/validation'

/**
 * Validation for `Examination.examinedAt` — the date the consultation
 * physically took place, as entered by the practitioner.
 *
 * Why this field exists at all: before it, the fișă de aptitudine printed
 * `signedAt ?? completedAt ?? createdAt` as the examination date. That is
 * the moment the record was *entered and signed in the software*, which is
 * frequently not the day the worker was actually seen — lab results arrive
 * late, the cabinet enters a morning's consultations in the afternoon, a
 * locum signs the next day. The official document has to carry the real
 * consultation date, and `signedAt` has to stay an untamperable record of
 * when the signature happened. They are two different facts, so they are
 * now two different columns.
 *
 * Why it is bounded rather than free-form: an unbounded date field on a
 * legal document is an invitation to deep backdating. The bound below is
 * the minimum that keeps the field honest while still covering real
 * late-entry workflows:
 *
 *   - Not older than MAX_BACKDATE_DAYS. Entering a consultation from eight
 *     months ago is either a data-migration job (which should not go
 *     through the clinical form) or something that needs a human decision,
 *     not a silent accept.
 *
 * Future dates are intentionally allowed. A cabinet's real workflow
 * includes preparing a fișă ahead of a scheduled appointment, so the
 * field no longer rejects a date later than "now" — a practitioner asked
 * for this and it does not open any backdating risk (the only thing the
 * future block guarded against).
 *
 * MAX_BACKDATE_DAYS is a judgement call, not a legal figure — 90 days
 * comfortably covers "we're behind on data entry" while still refusing
 * to quietly accept a date from last year. Change it here if the cabinet's
 * real workflow needs more room; it is referenced in exactly one place.
 */

export const MAX_BACKDATE_DAYS = 90

export interface ExaminedAtValidationContext {
  /** Injectable for tests; defaults to now. */
  now?: Date
}

/**
 * Parses and bounds-checks an incoming `examinedAt` value.
 *
 * Accepts a `YYYY-MM-DD` string (the form sends a date input) and pushes
 * human-readable problems onto `issues`, matching the convention used by
 * the other validators in lib/validation.ts.
 *
 * Returns:
 *   - `Date` when a valid in-range value was supplied
 *   - `null` when the caller explicitly cleared the field
 *   - `undefined` when the field was absent, or invalid (in which case
 *     `issues` has been appended to)
 *
 * The three-way return matters: PATCH semantics distinguish "clear this"
 * from "leave it alone", and a validation failure must not be mistaken
 * for either.
 */
export function parseExaminedAt(
  value: unknown,
  issues: string[],
  ctx: ExaminedAtValidationContext = {}
): Date | null | undefined {
  if (value === null || value === '') return null

  const parsed = optionalDate('examinedAt', value, issues)
  if (!parsed) return undefined

  const now = ctx.now ?? new Date()

  const oldestAllowed = new Date(now.getTime() - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000)
  if (parsed.getTime() < oldestAllowed.getTime()) {
    issues.push(`examinedAt cannot be more than ${MAX_BACKDATE_DAYS} days in the past`)
    return undefined
  }

  return parsed
}

/**
 * The date that should be printed on the fișă as the examination date.
 *
 * Falls back through the pre-existing chain so that examinations created
 * before `examinedAt` existed keep printing exactly what they printed
 * before — no retroactive change to already-issued documents.
 *
 * Note this deliberately does NOT consider `signedAt`. The old fișă page
 * had `signedAt` at the head of this chain, which is precisely the bug
 * this field fixes: the signing moment is rendered separately, in the
 * signature block, and is not the examination date.
 *
 * `completedAt` is set to `now()` at sign time if not already set (see
 * sign/route.ts) — i.e. for any exam signed going forward it is the same
 * instant as `signedAt`, just under another name. That used to reopen the
 * exact bug this field fixes whenever a practitioner left examinedAt
 * blank. As of the sign-time validation in sign/route.ts, examinedAt is
 * now required before an examination can be signed, so for every new
 * signed exam this function should resolve to `examinedAt` directly. The
 * `completedAt ?? createdAt` tail only still matters for exams signed
 * before that validation existed.
 */
export function resolveExaminationDate(examination: {
  examinedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}): Date {
  return examination.examinedAt ?? examination.completedAt ?? examination.createdAt
}

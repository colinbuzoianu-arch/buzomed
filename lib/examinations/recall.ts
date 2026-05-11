/**
 * Compute the next examination due date for a worker.
 *
 * Logic:
 *   - If the verdict is `apt` or `apt_conditionat`, the worker can keep
 *     working; the next exam is due `intervalMonths` months from the
 *     signing date.
 *   - If the verdict is `inapt` (permanently unfit) or `inapt_temporar`
 *     (temporarily unfit), there's no "next periodic exam" — that
 *     situation needs a different decision flow (return-to-work exam
 *     when the worker is cleared again). We return null.
 *
 * The workplace's `examinationIntervalMonths` (default 12) is the
 * primary input. The exam type's `defaultValidityMonths` is also
 * available as a fallback, but workplace risk profile takes precedence
 * because it reflects actual exposure.
 *
 * Output is a Date at UTC midnight to match @db.Date storage.
 */

import type { ExaminationVerdict } from '@prisma/client'

export interface RecallInput {
  verdict: ExaminationVerdict
  signedAt: Date
  workplaceIntervalMonths: number
}

export function computeNextExaminationDueDate(
  input: RecallInput
): Date | null {
  if (input.verdict === 'inapt' || input.verdict === 'inapt_temporar') {
    return null
  }

  const due = new Date(input.signedAt)
  due.setUTCMonth(due.getUTCMonth() + input.workplaceIntervalMonths)
  // Normalize to UTC midnight for @db.Date.
  return new Date(
    Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  )
}

import type { Prisma, PrismaClient, RecallStatus } from '@prisma/client'

/**
 * Create or update the Recall row that follows from a signed examination.
 *
 * Idempotency: called from two places — (a) the examination sign action,
 * which fires once per sign; (b) the one-time backfill script for
 * pre-session-9 signed examinations. Both must be safe to re-run.
 *
 * Logic:
 *   - If the examination's verdict is `inapt` or `inapt_temporar`: no
 *     recall is created. These workers can't return on a schedule; a
 *     return-to-work exam is what unblocks them. The schema's `Recall`
 *     row would be misleading.
 *   - If the examination has no `nextExaminationDueDate`: skip. (The
 *     practitioner explicitly cleared it; respect that.)
 *   - If a Recall already exists pointing at this examination as its
 *     source: update its `dueDate` to match (the practitioner may have
 *     edited it post-sign in some future flow) and exit.
 *   - Otherwise: insert a fresh `pending` Recall.
 *
 * This function does NOT compute the due date — `computeNextExaminationDueDate`
 * already lives in lib/examinations/recall.ts and the sign action
 * persists the result onto Examination. The Recall row just mirrors it.
 *
 * Caller can pass a transaction client (`tx`) or the global prisma; both work.
 *
 * Returns the Recall id when a row was created or updated; null when the
 * examination didn't warrant a recall (inapt / no due date).
 */

export interface UpsertRecallInput {
  examinationId: string
  tenantId: string
  employeeId: string
  workplaceId: string
  examinationTypeId: string
  verdict: 'apt' | 'apt_conditionat' | 'inapt_temporar' | 'inapt' | null
  nextExaminationDueDate: Date | null
}

export async function upsertRecallFromExamination(
  client: PrismaClient | Prisma.TransactionClient,
  input: UpsertRecallInput
): Promise<string | null> {
  // Supersede any PRIOR open recall for this employee+workplace. There
  // should only ever be one active recall per (employee, workplace): a
  // freshly signed examination is the latest word on that worker's next
  // periodic control, so every earlier recall it fulfils is closed here —
  // pointed at this examination — instead of being left alongside the one
  // this examination creates below.
  //
  // This covers BOTH:
  //   - imported recalls (createdFromExaminationId = null) from an external
  //     fișă entered at bulk import, and
  //   - recalls derived from a PREVIOUS examination signed in Buzomed.
  //
  // The second case is the fix for the production bug where an overdue
  // control never disappeared from the dashboard: when a periodic exam was
  // created directly (via /examinations/new) rather than scheduled from the
  // scadențe list, the previous examination's recall was never closed and
  // stayed `overdue` forever even though the worker had been re-examined.
  //
  // Runs regardless of verdict: even an `inapt` result retires the prior
  // schedule (the worker WAS examined). Idempotent and re-run safe — see
  // supersedePriorRecalls for the dueDate guard that protects newer recalls.
  await supersedePriorRecalls(client, input)

  // No recall for inapt/inapt_temporar/no-verdict cases.
  if (!input.verdict || input.verdict === 'inapt' || input.verdict === 'inapt_temporar') {
    return null
  }
  if (!input.nextExaminationDueDate) {
    return null
  }

  // Check for an existing Recall sourced from this examination. If we
  // find one, update its dueDate to the current value (idempotent
  // re-runs are safe; corrections post-sign are absorbed).
  const existing = await client.recall.findFirst({
    where: {
      tenantId: input.tenantId,
      createdFromExaminationId: input.examinationId,
      deletedAt: null,
    },
    select: { id: true, status: true, dueDate: true },
  })

  if (existing) {
    // Only update if the date actually changed AND the recall hasn't
    // already been completed/cancelled (those terminal states stay put).
    const sameDate = existing.dueDate.getTime() === input.nextExaminationDueDate.getTime()
    const terminal: RecallStatus[] = ['completed', 'cancelled']
    if (sameDate || terminal.includes(existing.status)) {
      return existing.id
    }
    await client.recall.update({
      where: { id: existing.id },
      data: { dueDate: input.nextExaminationDueDate },
    })
    return existing.id
  }

  const created = await client.recall.create({
    data: {
      tenant: { connect: { id: input.tenantId } },
      employee: { connect: { id: input.employeeId } },
      workplace: { connect: { id: input.workplaceId } },
      examinationType: { connect: { id: input.examinationTypeId } },
      createdFromExamination: { connect: { id: input.examinationId } },
      dueDate: input.nextExaminationDueDate,
      status: 'pending',
    },
    select: { id: true },
  })
  return created.id
}

/**
 * Mark the open recalls that this examination fulfils as completed,
 * pointing them at the given examination. Called from
 * upsertRecallFromExamination; see that call site for the rationale.
 *
 * Two kinds of prior recall are closed for this employee+workplace:
 *
 *   1. Imported recalls (createdFromExaminationId = null) — external fișă
 *      expiry dates entered at bulk import. ALL non-terminal ones are
 *      closed, regardless of their dueDate: a real examination always
 *      retires the external document's schedule (existing behavior).
 *
 *   2. Recalls derived from a PREVIOUS examination — but only those whose
 *      dueDate is strictly earlier than the schedule this examination
 *      establishes (`cutoff`, below). This dueDate guard is what keeps the
 *      operation safe to re-run and backfill-order-independent: a recall
 *      belonging to a NEWER examination always has a later dueDate, so an
 *      older examination's supersede never closes it. The recall this
 *      examination itself creates (same createdFromExaminationId) is also
 *      excluded explicitly as belt-and-suspenders — on a normal live sign
 *      it doesn't exist yet (this runs before the create below), but on a
 *      re-sign / backfill it might.
 *
 * `cutoff`:
 *   - apt / apt_conditionat: the new nextExaminationDueDate (a future date).
 *     Any earlier recall for the slot — overdue OR merely pending-and-due —
 *     is superseded, so no duplicates accumulate.
 *   - inapt / inapt_temporar / no due date: `now`, so only genuinely
 *     overdue prior recalls (dueDate < today) are retired; a not-yet-due
 *     recall for the slot is left for the cabinet to act on.
 *
 * Terminal recalls (completed/cancelled) are always left untouched.
 */
async function supersedePriorRecalls(
  client: PrismaClient | Prisma.TransactionClient,
  input: UpsertRecallInput
): Promise<void> {
  const cutoff = input.nextExaminationDueDate ?? new Date()

  // Fetch the candidates coarsely (all non-terminal recalls for the slot —
  // at most a handful) and decide row-by-row with the pure predicate below.
  // Keeping the decision in plain JS rather than a subtle Prisma OR/`not`
  // filter makes it unit-testable and removes the nullable-column `not`
  // footgun (a top-level `{ not: id }` would also drop null-source rows).
  const candidates = await client.recall.findMany({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      workplaceId: input.workplaceId,
      status: { notIn: ['completed', 'cancelled'] },
      deletedAt: null,
    },
    select: { id: true, createdFromExaminationId: true, dueDate: true },
  })

  for (const recall of candidates) {
    if (!isSupersededByExamination(recall, input.examinationId, cutoff)) continue
    await client.recall.update({
      where: { id: recall.id },
      data: {
        status: 'completed',
        completedExaminationId: input.examinationId,
      },
    })
  }
}

/**
 * Decide whether `recall` (a non-terminal recall already known to be for the
 * same employee+workplace as the signing examination) is fulfilled — and so
 * should be closed — by the examination identified by `examinationId`, whose
 * new schedule starts at `cutoff`.
 *
 * Pure and exported so the supersede rules are locked down by unit tests
 * without a database. The rules:
 *   - The examination never supersedes the recall it itself produced.
 *   - An imported recall (null source) is always superseded.
 *   - A recall from a different, earlier examination is superseded only when
 *     its dueDate is strictly before `cutoff` — so a NEWER examination's
 *     recall (later dueDate) is never closed by an older one, which keeps the
 *     operation safe to re-run and independent of backfill order.
 */
export function isSupersededByExamination(
  recall: { createdFromExaminationId: string | null; dueDate: Date },
  examinationId: string,
  cutoff: Date
): boolean {
  if (recall.createdFromExaminationId === examinationId) return false
  if (recall.createdFromExaminationId === null) return true
  return recall.dueDate.getTime() < cutoff.getTime()
}

/**
 * Cancel the Recall rows that were derived from an examination whose fișă
 * has just been revoked.
 *
 * Why this is necessary: signing an `apt` examination schedules the next
 * periodic check from that verdict's due date. If the verdict turns out to
 * be wrong and the fișă is withdrawn, that schedule is built on a fact the
 * cabinet no longer stands behind — leaving it `pending` would keep
 * driving recall notifications off a retracted document, and would collide
 * with the recall created by whichever examination replaces it.
 *
 * Only non-terminal recalls are touched. A recall already `completed`
 * (a follow-up examination consumed it) or already `cancelled` stays as
 * it is: those describe things that actually happened, and rewriting them
 * would falsify the history rather than correct it.
 *
 * The reason is appended to the recall's notes rather than stored in a
 * dedicated column — Recall has no revocation concept of its own, and the
 * authoritative record of why lives on the examination itself.
 *
 * Returns the number of recalls cancelled (0 is normal and expected: an
 * `inapt` examination never created one).
 */
export async function cancelRecallsFromRevokedExamination(
  client: PrismaClient | Prisma.TransactionClient,
  params: {
    examinationId: string
    tenantId: string
    examinationNumber: string
  }
): Promise<number> {
  const affected = await client.recall.findMany({
    where: {
      tenantId: params.tenantId,
      createdFromExaminationId: params.examinationId,
      status: { notIn: ['completed', 'cancelled'] },
      deletedAt: null,
    },
    select: { id: true, notes: true },
  })

  if (affected.length === 0) return 0

  const stamp = new Date().toISOString()
  const note = `[${stamp}] Anulat automat — fișa ${params.examinationNumber} a fost retrasă.`

  // Updated one at a time because each row's note is appended to its own
  // existing text; there is no single `data` payload that fits all rows.
  // Recalls per examination are at most a handful, so the round-trip count
  // is not a concern here.
  for (const recall of affected) {
    await client.recall.update({
      where: { id: recall.id },
      data: {
        status: 'cancelled',
        notes: recall.notes ? `${recall.notes}\n${note}` : note,
      },
    })
  }

  return affected.length
}

/**
 * Mark a Recall as completed, pointing at the examination that fulfilled
 * it. Used when a practitioner schedules + completes a follow-up exam.
 *
 * This is the inverse direction from upsertRecallFromExamination — the
 * Recall has been "consumed" by a new examination.
 *
 * No-op if the recall is already completed or cancelled.
 */
export async function markRecallCompleted(
  client: PrismaClient | Prisma.TransactionClient,
  recallId: string,
  completingExaminationId: string
): Promise<void> {
  const existing = await client.recall.findUnique({
    where: { id: recallId },
    select: { status: true },
  })
  if (!existing) return
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    return
  }
  await client.recall.update({
    where: { id: recallId },
    data: {
      status: 'completed',
      completedExaminationId: completingExaminationId,
    },
  })
}

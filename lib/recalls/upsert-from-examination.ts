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

import type { PrismaClient, Prisma, RecallStatus } from '@prisma/client'

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
  if (
    !input.verdict ||
    input.verdict === 'inapt' ||
    input.verdict === 'inapt_temporar'
  ) {
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
    const sameDate =
      existing.dueDate.getTime() === input.nextExaminationDueDate.getTime()
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

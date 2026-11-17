import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSupersededByExamination } from './upsert-from-examination'

// The examination being signed, and the schedule it establishes.
const EXAM = 'exam-new'
const cutoff = new Date('2026-11-17') // the new exam's nextExaminationDueDate

function recall(createdFromExaminationId: string | null, dueDate: string) {
  return { createdFromExaminationId, dueDate: new Date(dueDate) }
}

test('closes a prior OVERDUE examination-derived recall (the production bug)', () => {
  // Previous periodic exam left a recall due in the past; the worker has now
  // been re-examined directly (not via the scadențe list). It must be closed.
  assert.equal(isSupersededByExamination(recall('exam-old', '2025-06-01'), EXAM, cutoff), true)
})

test('closes an imported recall regardless of its dueDate', () => {
  assert.equal(isSupersededByExamination(recall(null, '2099-01-01'), EXAM, cutoff), true)
  assert.equal(isSupersededByExamination(recall(null, '2020-01-01'), EXAM, cutoff), true)
})

test('closes a prior pending-but-due recall (no duplicate accumulation)', () => {
  // dueDate before the new schedule but still in the future vs. "today".
  assert.equal(isSupersededByExamination(recall('exam-old', '2026-11-16'), EXAM, cutoff), true)
})

test('does NOT close the recall this examination itself produced', () => {
  assert.equal(isSupersededByExamination(recall(EXAM, '2027-11-17'), EXAM, cutoff), false)
})

test('does NOT close a NEWER examination recall (dueDate >= cutoff)', () => {
  // Backfill / re-run safety: a recall from a later exam has a later dueDate.
  assert.equal(isSupersededByExamination(recall('exam-newer', '2027-11-17'), EXAM, cutoff), false)
  // Exactly at cutoff is not strictly-before, so left alone.
  assert.equal(isSupersededByExamination(recall('exam-other', '2026-11-17'), EXAM, cutoff), false)
})

test('inapt case: cutoff=now retires only genuinely overdue prior recalls', () => {
  const now = new Date('2026-11-17')
  assert.equal(isSupersededByExamination(recall('exam-old', '2026-10-01'), EXAM, now), true)
  // A not-yet-due recall survives an inapt result.
  assert.equal(isSupersededByExamination(recall('exam-old', '2026-12-01'), EXAM, now), false)
})

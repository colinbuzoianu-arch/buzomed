/**
 * Shared employee fitness-status classification — one rule for the employees
 * list Status column and the employee detail header pill. Pure: no React.
 *
 * Classification mirrors the triage buckets: an open recall that is overdue
 * (or past due) → overdue; due within 30 days → soon; otherwise, if the worker
 * was never examined → never; else a future recall → ok; no open recall but
 * has exams → none.
 */

export type EmployeeStatusKind = 'overdue' | 'soon' | 'ok' | 'never' | 'none'

export interface EmployeeStatusInput {
  /** Earliest open recall (pending/scheduled/overdue), dueDate as 'YYYY-MM-DD'. */
  recall: { dueDate: string; status: string } | null
  /** Whether the employee has at least one completed examination. */
  hasExam: boolean
}

export interface EmployeeStatus {
  kind: EmployeeStatusKind
  /** overdue: days overdue; soon: days remaining; else 0. */
  days: number
  /** 'MM.YYYY' of the due date, only for kind 'ok'. */
  month: string
}

export function computeEmployeeStatus(input: EmployeeStatusInput, nowMs: number = Date.now()): EmployeeStatus {
  const dayMs = 86_400_000
  const { recall, hasExam } = input
  if (recall) {
    const due = new Date(recall.dueDate).getTime()
    const diffDays = Math.round((due - nowMs) / dayMs)
    if (recall.status === 'overdue' || due < nowMs) {
      return { kind: 'overdue', days: Math.max(0, -diffDays), month: '' }
    }
    if (diffDays <= 30) {
      return { kind: 'soon', days: Math.max(0, diffDays), month: '' }
    }
    if (!hasExam) return { kind: 'never', days: 0, month: '' }
    const [y, m] = recall.dueDate.split('-')
    return { kind: 'ok', days: 0, month: `${m}.${y}` }
  }
  if (!hasExam) return { kind: 'never', days: 0, month: '' }
  return { kind: 'none', days: 0, month: '' }
}

/** Dot colour per status kind (shared by the list cell). */
export const STATUS_DOT: Record<EmployeeStatusKind, string> = {
  overdue: 'bg-red-500',
  soon: 'bg-amber-500',
  ok: 'bg-muted-foreground/40',
  never: 'bg-muted-foreground/40',
  none: 'bg-muted-foreground/40',
}

/** Text colour per status kind (shared by the list cell). */
export const STATUS_TEXT: Record<EmployeeStatusKind, string> = {
  overdue: 'text-red-700 dark:text-red-300',
  soon: 'text-amber-700 dark:text-amber-300',
  ok: 'text-[hsl(var(--text-muted))]',
  never: 'text-[hsl(var(--text-muted))]',
  none: 'text-[hsl(var(--text-muted))]',
}

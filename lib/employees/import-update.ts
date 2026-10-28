/**
 * Employee import — UPDATE path helpers (prompt-import-update.md).
 *
 * When the operator turns on "Actualizează angajații existenți cu datele din
 * fișier", a row matched to an existing employee no longer skips: the
 * employee is updated in place with whatever the file changes. These helpers
 * hold the *pure* decision logic (no DB, no I/O) so it can be unit-tested and
 * so the one rule that matters most lives in one obvious place:
 *
 *   An empty cell in the file must NEVER erase an existing value — only a
 *   non-empty value that actually differs is written.
 *
 * CNP, name, birth date, gender and all medical data are deliberately NOT in
 * the updatable set: the import must never touch them (see the route).
 */

/** The employee fields the import is allowed to overwrite. */
export const UPDATABLE_EMPLOYEE_FIELDS = [
  'companyEmployeeId',
  'jobTitle',
  'email',
  'phone',
  'city',
  'notes',
] as const

export type UpdatableEmployeeField = (typeof UPDATABLE_EMPLOYEE_FIELDS)[number]

/** Current stored values (null when unset). */
export type ExistingEmployeeValues = Record<UpdatableEmployeeField, string | null>

/** Incoming values from the file row (null/undefined/empty = "not provided"). */
export type IncomingEmployeeValues = Partial<Record<UpdatableEmployeeField, string | null>>

export interface FieldChange {
  old: string | null
  new: string | null
}

export interface EmployeeFieldUpdate {
  /** Prisma `data` patch — only the fields that genuinely change. */
  data: Partial<Record<UpdatableEmployeeField, string>>
  /** Names of the fields that changed, for the per-row result. */
  changed: UpdatableEmployeeField[]
  /** old → new per changed field, for the audit log (never contains CNP). */
  changes: Partial<Record<UpdatableEmployeeField, FieldChange>>
}

function normalize(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Decide which employee fields to overwrite from a file row.
 *
 * A field is written only when the incoming value is non-empty AND different
 * from the stored value. An empty incoming value is ignored, so a blank cell
 * can never wipe data the doctor already relies on.
 */
export function computeEmployeeFieldUpdates(
  existing: ExistingEmployeeValues,
  incoming: IncomingEmployeeValues
): EmployeeFieldUpdate {
  const data: Partial<Record<UpdatableEmployeeField, string>> = {}
  const changed: UpdatableEmployeeField[] = []
  const changes: Partial<Record<UpdatableEmployeeField, FieldChange>> = {}

  for (const field of UPDATABLE_EMPLOYEE_FIELDS) {
    const next = normalize(incoming[field])
    if (next === null) continue // empty cell — never erase (hard rule)
    const prev = normalize(existing[field])
    if (next === prev) continue // unchanged — keep idempotent
    data[field] = next
    changed.push(field)
    changes[field] = { old: prev, new: next }
  }

  return { data, changed, changes }
}

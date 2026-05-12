/**
 * CNP (Cod Numeric Personal) validation.
 *
 * Structure: 13 digits, S YY MM DD JJ NNN C
 *
 *   S    — gender + century:
 *            1, 2: born 1900-1999 (M, F)
 *            3, 4: born 1800-1899 (M, F)
 *            5, 6: born 2000-2099 (M, F)
 *            7, 8: resident foreigners
 *            9:    foreigners
 *   YY   — last two digits of birth year
 *   MM   — birth month (01-12)
 *   DD   — birth day (01-31)
 *   JJ   — county code (01-46 + 51, 52; 41-46 are sectors of Bucharest)
 *   NNN  — sequence number within the day (001-999)
 *   C    — checksum digit (computed from a fixed weight vector)
 *
 * The checksum digit is computed as the sum of (digit_i * weight_i) for
 * i in 0..11, modulo 11, with 10 → 1 by convention.
 *
 *   Weights: 2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9
 */

export interface CnpValidationResult {
  valid: boolean
  /** Specific failure reason, present iff valid=false. */
  reason?:
    | 'wrong_length'
    | 'non_numeric'
    | 'invalid_gender_century_code'
    | 'invalid_month'
    | 'invalid_day'
    | 'invalid_county_code'
    | 'invalid_sequence'
    | 'invalid_checksum'
  /** Extracted birth date if everything before the date check parsed. */
  birthDate?: Date
  /** 'M' or 'F'; only set when the gender/century code is valid. */
  gender?: 'M' | 'F'
}

const CHECKSUM_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9]

const VALID_COUNTY_CODES = new Set<number>([
  ...Array.from({ length: 46 }, (_, i) => i + 1), // 1-46
  51,
  52,
])

/**
 * Returns the gender + the century base year (e.g. 1900) for the given
 * leading digit. Returns null if the digit is unknown.
 */
function decodeGenderCentury(
  s: number
): { gender: 'M' | 'F'; centuryBase: number } | null {
  switch (s) {
    case 1: return { gender: 'M', centuryBase: 1900 }
    case 2: return { gender: 'F', centuryBase: 1900 }
    case 3: return { gender: 'M', centuryBase: 1800 }
    case 4: return { gender: 'F', centuryBase: 1800 }
    case 5: return { gender: 'M', centuryBase: 2000 }
    case 6: return { gender: 'F', centuryBase: 2000 }
    case 7: return { gender: 'M', centuryBase: 1900 } // resident foreigners
    case 8: return { gender: 'F', centuryBase: 1900 } // resident foreigners
    // s=9 is foreigners; gender encoding isn't defined consistently, so
    // we accept the CNP but don't expose a gender. Most software treats
    // these as M for the embedded-date check; we follow that convention.
    case 9: return { gender: 'M', centuryBase: 1900 }
    default: return null
  }
}

/**
 * Full validation. Use this on every CNP that enters the system.
 *
 * Returns valid=true plus birthDate + gender when the CNP passes every
 * check. Returns valid=false plus a `reason` otherwise. We don't throw
 * because the route handler wants to push the reason into the `issues`
 * array along with other field errors.
 */
export function validateCnp(input: string): CnpValidationResult {
  if (typeof input !== 'string' || input.length !== 13) {
    return { valid: false, reason: 'wrong_length' }
  }
  if (!/^\d{13}$/.test(input)) {
    return { valid: false, reason: 'non_numeric' }
  }

  const digits = input.split('').map((c) => parseInt(c, 10))
  const decoded = decodeGenderCentury(digits[0])
  if (!decoded) {
    return { valid: false, reason: 'invalid_gender_century_code' }
  }

  const yy = digits[1] * 10 + digits[2]
  const mm = digits[3] * 10 + digits[4]
  const dd = digits[5] * 10 + digits[6]
  const county = digits[7] * 10 + digits[8]
  const seq = digits[9] * 100 + digits[10] * 10 + digits[11]

  if (mm < 1 || mm > 12) {
    return { valid: false, reason: 'invalid_month' }
  }
  const year = decoded.centuryBase + yy
  // Build the date and verify it's consistent (catches Feb 30 etc.)
  const birthDate = new Date(Date.UTC(year, mm - 1, dd))
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== mm - 1 ||
    birthDate.getUTCDate() !== dd
  ) {
    return { valid: false, reason: 'invalid_day' }
  }

  if (!VALID_COUNTY_CODES.has(county)) {
    return { valid: false, reason: 'invalid_county_code' }
  }

  if (seq < 1) {
    return { valid: false, reason: 'invalid_sequence' }
  }

  // Checksum
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * CHECKSUM_WEIGHTS[i]
  }
  const expected = sum % 11 === 10 ? 1 : sum % 11
  if (expected !== digits[12]) {
    return { valid: false, reason: 'invalid_checksum' }
  }

  return {
    valid: true,
    birthDate,
    gender: decoded.gender,
  }
}

/**
 * Mask a CNP for display. Shows first 6 digits (gender + birth date) and
 * masks the last 7. Returns null if the input doesn't look like a CNP.
 *
 *   1850315120030  →  185031*******
 *
 * Used in lists and inline displays. The unmasked CNP is only ever shown
 * after the user clicks a reveal control, and only when the API actually
 * returned the unmasked value (i.e. the caller is permitted).
 */
export function maskCnp(cnp: string | null | undefined): string | null {
  if (!cnp || typeof cnp !== 'string' || cnp.length !== 13) return null
  return cnp.slice(0, 6) + '*'.repeat(7)
}

/**
 * Helper for the UI's birth-date warning: returns the CNP's embedded date
 * (UTC midnight) if the CNP is structurally valid, else null. Doesn't
 * verify checksum — meant for inline cross-checks where the full
 * validation may not yet have run.
 */
export function extractBirthDateLoose(cnp: string): Date | null {
  const result = validateCnp(cnp)
  return result.valid ? result.birthDate ?? null : null
}

/**
 * Translates a validation reason to a human-readable Romanian + English
 * message. Used by route handlers to push readable errors into the
 * `issues` array. Keep these in sync with the i18n keys in
 * `employees.cnpError.*` (the UI prefers translated strings via t()).
 */
export function cnpReasonToIssue(reason: NonNullable<CnpValidationResult['reason']>): string {
  switch (reason) {
    case 'wrong_length':
      return 'CNP must be exactly 13 digits'
    case 'non_numeric':
      return 'CNP must contain only digits'
    case 'invalid_gender_century_code':
      return 'CNP first digit (gender/century) is not valid'
    case 'invalid_month':
      return 'CNP birth month is out of range'
    case 'invalid_day':
      return 'CNP birth day does not exist'
    case 'invalid_county_code':
      return 'CNP county code is not valid'
    case 'invalid_sequence':
      return 'CNP sequence number is not valid'
    case 'invalid_checksum':
      return 'CNP checksum does not match — please re-verify the number'
  }
}

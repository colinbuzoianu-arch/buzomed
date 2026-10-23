import { decryptCnp } from '@/lib/crypto/cnp-cipher'

/**
 * Resolve the identity number to print on an official document for an
 * employee.
 *
 * The data model is the subtlety here, and getting it wrong is exactly the
 * bug this helper centralizes the fix for: when `idDocumentType` is 'cnp',
 * the CNP lives encrypted in `cnpEncrypted` and `idDocumentNumber` is NULL
 * (the plaintext is cleared on create/import). Reading `idDocumentNumber`
 * for the CNP field — as the document routes used to — therefore printed an
 * empty CNP for every Romanian worker. For a non-CNP document type (e.g. a
 * foreign worker's passport) the number is kept in plaintext in
 * `idDocumentNumber`, so that stays the source.
 *
 * Decryption is gated on `canViewPii` (pass the result of
 * `canViewSensitivePii`): an assistant generating a document gets it without
 * the CNP rather than a side channel around the PII policy. The three-field
 * result lets the caller audit a real decryption and log a broken ciphertext
 * distinctly from "no permission" / "no CNP on file".
 */

export interface CnpSourceEmployee {
  idDocumentType: string
  cnpEncrypted: string | null
  idDocumentNumber: string | null
}

export interface ResolvedCnp {
  /** The value to print; '' when unavailable, not on file, or not permitted. */
  value: string
  /** True only when a CNP was actually decrypted — the trigger for an audit entry. */
  decrypted: boolean
  /** True when a CNP was stored but decryption threw (tampered/stale key). */
  error: boolean
}

export function resolveEmployeeCnp(
  employee: CnpSourceEmployee,
  canViewPii: boolean
): ResolvedCnp {
  if (employee.idDocumentType === 'cnp') {
    if (employee.cnpEncrypted && canViewPii) {
      try {
        return { value: decryptCnp(employee.cnpEncrypted), decrypted: true, error: false }
      } catch {
        return { value: '', decrypted: false, error: true }
      }
    }
    return { value: '', decrypted: false, error: false }
  }
  return { value: employee.idDocumentNumber ?? '', decrypted: false, error: false }
}

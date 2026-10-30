/**
 * Composes the free-text that prints next to the verdict on the fișă de
 * aptitudine, from two separate parts:
 *
 *   - `requirements` — the employer's requested conditions the doctor chose to
 *     put on the fișă (`Examination.employerRequirementsOnFisa`).
 *   - `existing` — whatever already prints there today
 *     (`verdictConditions ?? recommendations`), unchanged.
 *
 * Result shape:
 *   - both present  → "REQUIREMENTS. EXISTING TEXT"
 *   - only requirements → "REQUIREMENTS"        (no trailing dot added)
 *   - only existing text → "EXISTING TEXT"      (no leading dot)
 *   - neither → ""
 *
 * Both parts are trimmed. When the requirements part already ends with ".", a
 * second dot is not added. The result never starts or ends with ". ".
 *
 * This is the ONLY place the two parts are joined, so every rendering of the
 * fișă (official AcroForm, react-pdf copy, on-screen page, archived copy)
 * agrees.
 */
export function composeFisaRecommendations(
  requirements: string | null | undefined,
  existing: string | null | undefined
): string {
  const req = (requirements ?? '').trim()
  const ex = (existing ?? '').trim()

  if (!req && !ex) return ''
  if (req && !ex) return req
  if (!req && ex) return ex

  // Both present — "REQUIREMENTS. EXISTING", without doubling a trailing dot.
  const reqPart = req.endsWith('.') ? req : `${req}.`
  return `${reqPart} ${ex}`
}

/**
 * Diacritics folding for search, shared by the JS side (normalising the
 * query term) and the SQL side (normalising the column via `translate`).
 *
 * We deliberately do NOT depend on the Postgres `unaccent` extension: it is
 * not installed on this database, and requiring it would make the feature
 * fail in prod with a cryptic error. Instead we fold the small, fixed set of
 * Romanian diacritics (including the cedilla variants ş/ţ that older data and
 * some keyboards still produce) with a plain `translate()` call, which needs
 * no extension and is index-irrelevant here anyway (we LIKE-scan a bounded,
 * tenant-scoped set).
 *
 * The two sides MUST stay in sync: `FOLD_FROM`/`FOLD_TO` are the exact
 * arguments passed to SQL `translate(lower(col), FOLD_FROM, FOLD_TO)`, and
 * `normalizeTerm` applies the identical transformation in JS so the compared
 * strings line up.
 */

// Lowercase diacritic → ASCII. Uppercase forms are handled by lower() first
// (SQL) and toLowerCase() (JS), so only the lowercase mappings are listed.
//   ă â → a   î → i   ș ş → s   ț ţ → t
export const FOLD_FROM = 'ăâîșşțţ'
export const FOLD_TO = 'aaisstt'

const FOLD_MAP: Record<string, string> = Object.fromEntries(
  [...FOLD_FROM].map((ch, i) => [ch, FOLD_TO[i]])
)

/**
 * Lowercase + fold diacritics, matching the SQL expression exactly.
 * Used both for the term the user typed and (implicitly) for the column.
 */
export function normalizeTerm(input: string): string {
  const lower = input.toLowerCase()
  let out = ''
  for (const ch of lower) {
    out += FOLD_MAP[ch] ?? ch
  }
  return out
}

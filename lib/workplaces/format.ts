/**
 * Single source of truth for how a workplace ("loc de muncă") is labelled
 * once it may belong to a work site ("punct de lucru").
 *
 * An employer's file carries two location concepts:
 *   - the workplace / activity (Comercial, Sector distributie apă, Dispecerat)
 *     — the risk unit, our `Workplace` with its riskProfile.
 *   - the work site / territorial unit (Geoagiu, Brad, P.L. Ilia) — our
 *     `WorkSite`.
 *
 * Wherever the two must be shown together — lists, dropdowns, the examination
 * wizard, reports, the HR portal, exports, and the "Post și loc de muncă"
 * field of the fișă de aptitudine — they print as "{workplace} / {site}".
 * A workplace with no site prints as just its name, so every pre-existing
 * (site-less) workplace reads exactly as it did before this feature.
 *
 * Keep this the ONLY place that formats the combined label. If the printed
 * form ever changes (separator, order), it changes here and everywhere at once.
 */

/** The minimal shape needed to build a label — a workplace with an optional site. */
export interface WorkplaceLabelParts {
  name: string
  workSite?: { name: string | null } | null
}

/** The separator between workplace and site in the combined label. */
export const WORKPLACE_SITE_SEPARATOR = ' / '

/**
 * "{workplace} / {site}" when a site is set, otherwise just the workplace name.
 * Both parts are trimmed; a blank/whitespace-only site name is treated as no
 * site (so it never renders a dangling " / ").
 */
export function formatWorkplaceLabel(workplace: WorkplaceLabelParts): string {
  const name = (workplace.name ?? '').trim()
  const site = workplace.workSite?.name?.trim()
  return site ? `${name}${WORKPLACE_SITE_SEPARATOR}${site}` : name
}

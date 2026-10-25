/**
 * Public (marketing) site URL — used for canonical links, sitemap,
 * robots.txt and Open Graph tags. Set NEXT_PUBLIC_SITE_URL in Vercel if
 * the primary domain ever changes (no trailing slash).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://buzomed.com').replace(/\/$/, '')

export const SITE_NAME = 'Buzomed'

export const SITE_DESCRIPTION =
  'Buzomed este platforma și software-ul pentru cabinete de medicina muncii din România: evidența angajaților și a firmelor, programarea examinărilor periodice, fișa de aptitudine conform HG 355/2007, scadențe, contracte și facturi.'

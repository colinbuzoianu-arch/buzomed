/**
 * Excel-friendly CSV serialization.
 *
 * Reasoning about every choice:
 *
 *   - Delimiter: comma. Standard. Romanian Excel localizations sometimes
 *     prefer semicolons ("CSV (delimitat prin punct și virgulă)"), but
 *     comma works in every locale's "Text-to-Columns" wizard. We accept
 *     a one-time UX papercut over locale-dependent output.
 *
 *   - Line endings: CRLF. RFC 4180 says CRLF; Excel on Windows requires
 *     it for some configurations. Linux / macOS Excel tolerate it.
 *
 *   - Encoding: UTF-8 with BOM. Without the BOM, Excel on Windows
 *     interprets the file as Windows-1252 and breaks Romanian
 *     diacritics (ț, ă, ș). The BOM is 3 bytes (EF BB BF) and harmless
 *     on macOS / Linux / Google Sheets.
 *
 *   - Quoting: every field is quoted. Simpler than "only quote when
 *     necessary", and Excel doesn't care. Embedded quotes are doubled
 *     per RFC 4180.
 *
 *   - Date format: ISO 8601 (YYYY-MM-DD) for date-only fields, and
 *     locale-sensitive formatting is the CALLER's responsibility. The
 *     helper itself only knows strings.
 *
 *   - Null handling: rendered as empty string, not the literal "null".
 *
 * Usage:
 *
 *   const rows: CsvRow[] = [
 *     ['Header 1', 'Header 2'],
 *     ['value', '12.34'],
 *   ]
 *   const body = renderCsv(rows)
 *   return new NextResponse(body, {
 *     headers: {
 *       'Content-Type': 'text/csv; charset=utf-8',
 *       'Content-Disposition': `attachment; filename="${filename}"`,
 *     },
 *   })
 */

export type CsvCell = string | number | Date | null | undefined
export type CsvRow = CsvCell[]

const BOM = '\uFEFF'

function formatCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '""'
  if (cell instanceof Date) {
    // ISO date-only (YYYY-MM-DD). For timestamps with time-of-day, the
    // caller should pre-format to a localized string.
    if (isNaN(cell.getTime())) return '""'
    const yyyy = cell.getUTCFullYear()
    const mm = String(cell.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(cell.getUTCDate()).padStart(2, '0')
    return `"${yyyy}-${mm}-${dd}"`
  }
  const str =
    typeof cell === 'number' ? String(cell) : String(cell)
  // Per RFC 4180: double-up embedded double quotes.
  return `"${str.replace(/"/g, '""')}"`
}

export function renderCsv(rows: CsvRow[]): string {
  const lines = rows.map((row) => row.map(formatCell).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

/**
 * Sanitizes a string for use as a filename. Strips characters that
 * trip up Windows / macOS / Linux file systems, replaces whitespace
 * with underscores, and trims length to 100 chars.
 */
export function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100)
}

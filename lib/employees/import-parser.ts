/**
 * Bulk-import parser.
 *
 * Accepts either CSV text or an Excel file (XLSX/XLS), produces a
 * normalized array of `RawRow` objects keyed by detected column.
 *
 * Header detection is fuzzy. We don't require a specific filename or
 * column order — the cabinet can paste their existing HR export and
 * the importer figures out which column means what. The expected
 * columns are:
 *
 *   - firstName       (nume, prenume, first name, prenume angajat, ...)
 *   - lastName        (nume de familie, surname, last name, nume, ...)
 *   - companyEmployeeId (id angajat, marca, marcă, employee id, payroll, ...)
 *   - email
 *   - department      (departament, locul de munca, workplace, post, ...)
 *
 * Note that "nume" alone is ambiguous in Romanian — it can mean either
 * full name OR last name. We use position heuristics: if both "nume"
 * and "prenume" are present, "nume" is last name. If only "nume" is
 * present, we treat it as last name and rely on a separate "prenume"
 * column being absent as confirmation.
 */

import Papa from 'papaparse'

// Note: `xlsx` is dynamically imported inside parseXlsx() to keep it
// out of bundles that only handle CSV. It's a ~700 KB lib.

export type ColumnKey =
  | 'firstName'
  | 'lastName'
  | 'companyEmployeeId'
  | 'email'
  | 'department'
  | 'jobTitle'
  | 'city'

export interface RawRow {
  rowNumber: number // 1-indexed in the source file (header = 0)
  firstName: string | null
  lastName: string | null
  companyEmployeeId: string | null
  email: string | null
  department: string | null
  jobTitle: string | null
  city: string | null
  raw: Record<string, string> // for debugging / displaying unmapped values
}

export interface ColumnMapping {
  detected: Partial<Record<ColumnKey, string>> // detectedColumnKey → source header name
  unmappedHeaders: string[]
  missingColumns: ColumnKey[] // required cols not detected
}

const REQUIRED_COLS: ColumnKey[] = ['firstName', 'lastName']

/**
 * Fuzzy matches a header string against known aliases for each column.
 * Returns the matched ColumnKey or null. Case-insensitive, strips
 * whitespace and Romanian diacritics for comparison.
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[._\-/]/g, ' ')
    .replace(/\s+/g, ' ')
}

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  firstName: [
    'prenume',
    'prenumele',
    'first name',
    'firstname',
    'given name',
    'nume mic',
    'prenume angajat',
  ],
  lastName: [
    'nume',
    'nume de familie',
    'numele',
    'last name',
    'lastname',
    'surname',
    'family name',
    'nume familie',
  ],
  companyEmployeeId: [
    'id angajat',
    'id',
    'marca',
    'marca angajat',
    'matricola',
    'cod angajat',
    'numar matricol',
    'employee id',
    'payroll id',
    'payroll',
    'employee number',
    'badge',
    'badge number',
  ],
  email: [
    'email',
    'e-mail',
    'mail',
    'adresa email',
    'email address',
    'adresa de email',
  ],
  department: [
    'departament',
    'department',
    'sectie',
    'sectia',
    'compartiment',
    'birou',
    'workplace',
    'loc de munca',
    'locul de munca',
    'post',
    'post de lucru',
    'unit',
  ],
  jobTitle: [
    'functie',
    'functia',
    'job title',
    'jobtitle',
    'job',
    'pozitie',
    'pozitia',
    'ocupatie',
    'ocupatia',
    'rol',
    'role',
    'beruf',
    'berufsbezeichnung',
    'designation',
    'title',
    'titlu',
  ],
  city: [
    'oras',
    'orasul',
    'localitate',
    'localitatea',
    'city',
    'town',
    'location',
    'locatie',
    'locatia',
    'stadt',
    'wohnort',
  ],
}

function detectColumn(header: string): ColumnKey | null {
  const norm = normalizeHeader(header)

  // Prefer exact matches over partial matches. Tied scores resolved by
  // alias ordering (first wins).
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [ColumnKey, string[]]
  >) {
    for (const alias of aliases) {
      if (norm === alias) return key
    }
  }
  // Fall back to "contains" matching — useful for headers like
  // "Nume / Prenume" or "ID angajat (marca)".
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [ColumnKey, string[]]
  >) {
    for (const alias of aliases) {
      if (norm.includes(alias)) return key
    }
  }
  return null
}

/**
 * Disambiguates the "nume" alias: if both "nume" and "prenume" headers
 * are present, "nume" → lastName. The default mapping already does
 * that, but this function makes the rule explicit and warns if we
 * detect ambiguity.
 */
function resolveMapping(headers: string[]): ColumnMapping {
  const detected: Partial<Record<ColumnKey, string>> = {}
  const unmappedHeaders: string[] = []

  for (const header of headers) {
    const col = detectColumn(header)
    if (col && !detected[col]) {
      detected[col] = header
    } else if (col) {
      // Already mapped — header collision, treat as unmapped.
      unmappedHeaders.push(header)
    } else {
      unmappedHeaders.push(header)
    }
  }

  const missingColumns = REQUIRED_COLS.filter((c) => !detected[c])
  return { detected, unmappedHeaders, missingColumns }
}

/**
 * Parses a CSV string into rows. Auto-detects delimiter (comma /
 * semicolon / tab — papaparse handles this). Skips empty rows.
 */
export function parseCsv(text: string): {
  headers: string[]
  rows: Array<Record<string, string>>
  errors: string[]
} {
  // Strip a UTF-8 BOM if present (Excel exports often include one).
  const cleaned = text.replace(/^\uFEFF/, '')
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    delimitersToGuess: [',', ';', '\t', '|'],
  })
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map(
      (e) => `Row ${e.row}: ${e.message}`
    ),
  }
}

/**
 * Parses an XLSX file (raw buffer) into rows. Uses the first sheet
 * only — multi-sheet workbooks are not supported (cabinets rarely
 * have legitimate multi-sheet employee lists, and we want clarity).
 *
 * Lazy-imports the xlsx package so the ~700 KB lib only loads when
 * the user actually selects an Excel file.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<{
  headers: string[]
  rows: Array<Record<string, string>>
  errors: string[]
}> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  if (wb.SheetNames.length === 0) {
    return { headers: [], rows: [], errors: ['No sheets in workbook'] }
  }
  const firstSheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    header: 'A',
    blankrows: false,
    defval: '',
  })
  if (rows.length === 0) {
    return { headers: [], rows: [], errors: ['Sheet is empty'] }
  }
  // First row = headers, rest = data.
  const headerRow = rows[0]
  const headers = Object.values(headerRow).map((v) => String(v).trim())
  const colKeys = Object.keys(headerRow)
  const dataRows = rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      const colKey = colKeys[i]
      obj[headers[i]] = String(row[colKey] ?? '').trim()
    }
    return obj
  })
  return { headers, rows: dataRows, errors: [] }
}

/**
 * Top-level entry: takes raw text or buffer, returns mapped rows.
 * Async because XLSX parsing dynamically imports its lib.
 */
export async function parseImportFile(
  input: { text: string } | { buffer: ArrayBuffer; filename: string }
): Promise<{
  mapping: ColumnMapping
  rows: RawRow[]
  parseErrors: string[]
}> {
  let parsed: { headers: string[]; rows: Array<Record<string, string>>; errors: string[] }

  if ('text' in input) {
    parsed = parseCsv(input.text)
  } else {
    const lower = input.filename.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      parsed = await parseXlsx(input.buffer)
    } else {
      const text = new TextDecoder('utf-8').decode(input.buffer)
      parsed = parseCsv(text)
    }
  }

  const mapping = resolveMapping(parsed.headers)

  const rows: RawRow[] = parsed.rows.map((row, idx) => {
    const get = (col: ColumnKey): string | null => {
      const sourceHeader = mapping.detected[col]
      if (!sourceHeader) return null
      const v = row[sourceHeader]
      if (v === undefined || v === null) return null
      const trimmed = String(v).trim()
      return trimmed === '' ? null : trimmed
    }
    return {
      rowNumber: idx + 2,
      firstName: get('firstName'),
      lastName: get('lastName'),
      companyEmployeeId: get('companyEmployeeId'),
      email: get('email'),
      department: get('department'),
      jobTitle: get('jobTitle'),
      city: get('city'),
      raw: row,
    }
  })

  return { mapping, rows, parseErrors: parsed.errors }
}

export interface AiColumnMappingResult {
  mapping: ColumnMapping
  aiUsed: boolean
  confidence: Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>>
}

/**
 * Enhances fuzzy column mapping with AI when ≥2 required columns are undetected.
 * Only column header names are sent to the API — never actual row data.
 * Falls back gracefully on timeout (5 s) or any API error.
 * Must be called from a client context (uses fetch with a relative URL).
 */
export async function aiEnhancedColumnMapping(
  headers: string[],
  fuzzyMapping: ColumnMapping
): Promise<AiColumnMappingResult> {
  if (fuzzyMapping.missingColumns.length < 2) {
    return { mapping: fuzzyMapping, aiUsed: false, confidence: {} }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  let res: Response
  try {
    res = await fetch('/api/ai/column-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers }),
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timeoutId)
    return { mapping: fuzzyMapping, aiUsed: false, confidence: {} }
  }
  clearTimeout(timeoutId)

  if (!res.ok) return { mapping: fuzzyMapping, aiUsed: false, confidence: {} }

  let json: {
    mapping: Record<string, string | null>
    confidence: Record<string, 'high' | 'medium' | 'low'>
  }
  try {
    json = await res.json()
  } catch {
    return { mapping: fuzzyMapping, aiUsed: false, confidence: {} }
  }

  // Merge: fuzzy-detected columns keep their mapping; AI fills the gaps only.
  const mergedDetected: Partial<Record<ColumnKey, string>> = { ...fuzzyMapping.detected }
  const mergedConfidence: Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>> = {}
  const stillUnmapped: string[] = []

  for (const header of fuzzyMapping.unmappedHeaders) {
    const aiKey = json.mapping?.[header] as ColumnKey | null | undefined
    if (
      aiKey &&
      typeof aiKey === 'string' &&
      (REQUIRED_COLS as string[]).concat(['companyEmployeeId', 'email', 'department', 'jobTitle', 'city']).includes(aiKey) &&
      !mergedDetected[aiKey as ColumnKey]
    ) {
      mergedDetected[aiKey as ColumnKey] = header
      const conf = json.confidence?.[header]
      mergedConfidence[aiKey as ColumnKey] = (['high', 'medium', 'low'] as const).includes(conf)
        ? conf
        : 'low'
    } else {
      stillUnmapped.push(header)
    }
  }

  const missingColumns = REQUIRED_COLS.filter((c) => !mergedDetected[c])
  return {
    mapping: { detected: mergedDetected, unmappedHeaders: stillUnmapped, missingColumns },
    aiUsed: true,
    confidence: mergedConfidence,
  }
}

/**
 * Row-level validation. Returns issues for one row; an empty array
 * means the row is committable.
 *
 * - firstName and lastName are required.
 * - email if present must look like an email.
 * - companyEmployeeId, department are optional.
 *
 * We DELIBERATELY do not validate the department against the actual
 * Workplace list here — that's done server-side using the live DB.
 * The client validation only catches shape problems.
 */
export interface RowValidation {
  rowNumber: number
  issues: string[]
  warnings: string[]
}

export function validateRow(row: RawRow): RowValidation {
  const issues: string[] = []
  const warnings: string[] = []

  if (!row.firstName) issues.push('missing_first_name')
  if (!row.lastName) issues.push('missing_last_name')
  if (row.email) {
    // Loose email check — match the rest of the codebase's pattern.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      issues.push('invalid_email')
    }
  }
  if (!row.department) {
    warnings.push('no_department')
  }

  return { rowNumber: row.rowNumber, issues, warnings }
}

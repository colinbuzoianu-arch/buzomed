/**
 * Bulk-import parser.
 *
 * Accepts either CSV text or an Excel file (XLSX/XLS), produces a
 * normalized array of `RawRow` objects keyed by detected column.
 *
 * Header detection is fuzzy AND positional. We don't require a specific
 * filename, column order, or that the header sits on the first row — the
 * cabinet can paste their existing HR export and the importer figures out
 * which column means what. The columns we understand are:
 *
 *   - firstName       (prenume, first name, ...)
 *   - lastName        (nume, surname, ...)
 *   - cnp             (cnp, cod numeric personal, c.n.p., ...)  — optional
 *   - companyEmployeeId (id angajat, marca, matricola, ...)
 *   - email
 *   - jobTitle        (functie, ocupatie, ...)
 *   - workplaceName   (loc de munca, punct de lucru, LOCATIE, ...)
 *   - department      (departament, sectie, birou, ...)
 *   - hireDate        (data angajarii, data angaj., hire date, ...) — optional
 *   - fitnessValidUntil (expirare fisa aptitudine, valabil pana la, ...) — optional
 *   - notes           (mentiuni, observatii, obs, ...) — optional
 *   - companyName / cui / companyAddress (extended per-row company data)
 *
 * Workplace vs. department (import spec §5): a *workplace* is the Buzomed
 * `Workplace` entity (what medicina muncii attaches risks, job sheets and
 * recalls to); a *department* is just descriptive text on that workplace.
 * The single rule, identical in both import modes: a workplace value is
 * found-or-created under the resolved company; a department-only value is
 * matched against existing workplaces and, failing that, creates a
 * workplace named after the department. A row is never rejected for
 * lacking a workplace.
 *
 * Robustness (import spec §6): the header row is searched for in the first
 * ~15 rows; single-cell separator bands (months, years, "SUSPENDAT") and
 * repeated header rows mid-sheet are skipped; every sheet with a
 * recognizable header is read and its rows cumulated (tagged with the
 * source sheet); columns with values but no header are surfaced as
 * unmapped rather than silently dropped.
 *
 * Note that "nume" alone is ambiguous in Romanian — it can mean either
 * full name OR last name. We use position heuristics: if both "nume"
 * and "prenume" are present, "nume" is last name.
 */

import Papa from 'papaparse'
import { validateCnp } from '@/lib/crypto/cnp-validation'
import {
  combineDateParts,
  isFutureDate,
  normalizeCnpInput,
  parseFlexibleDate,
} from './import-normalize'

// Note: `xlsx` is dynamically imported inside parseXlsxSheets() to keep it
// out of bundles that only handle CSV. It's a ~700 KB lib.

export type ColumnKey =
  | 'firstName'
  | 'lastName'
  | 'cnp'
  | 'companyEmployeeId'
  | 'email'
  | 'department'
  | 'jobTitle'
  | 'city'
  | 'companyName'
  | 'cui'
  | 'companyAddress'
  | 'workplaceName'
  | 'hireDate'
  | 'fitnessValidUntil'
  // Split fitness-expiry date (some HR exports, e.g. APAPROD, put it in
  // three separate columns: ZIUA EXP. / LUNA EXP. / ANUL EXP.). These are
  // assembled into `fitnessValidUntil` when the single column is absent.
  | 'fitnessValidUntilDay'
  | 'fitnessValidUntilMonth'
  | 'fitnessValidUntilYear'
  | 'notes'

/** Every column the mapping UI / AI is allowed to assign a header to. */
export const ASSIGNABLE_COLUMN_KEYS: ColumnKey[] = [
  'firstName',
  'lastName',
  'cnp',
  'companyEmployeeId',
  'email',
  'department',
  'jobTitle',
  'city',
  'companyName',
  'cui',
  'companyAddress',
  'workplaceName',
  'hireDate',
  'fitnessValidUntil',
  'fitnessValidUntilDay',
  'fitnessValidUntilMonth',
  'fitnessValidUntilYear',
  'notes',
]

export interface RawRow {
  rowNumber: number // globally unique, 1-indexed across all cumulated sheets
  sheetName: string | null // source sheet (null for CSV / single-sheet)
  firstName: string | null
  lastName: string | null
  cnp: string | null
  companyEmployeeId: string | null
  email: string | null
  department: string | null
  jobTitle: string | null
  city: string | null
  // Extended import columns — present when file uses the new template
  companyName: string | null
  cui: string | null
  companyAddress: string | null
  workplaceName: string | null
  hireDate: string | null
  fitnessValidUntil: string | null
  notes: string | null
  raw: Record<string, string> // for debugging / displaying unmapped values
}

export interface ColumnMapping {
  detected: Partial<Record<ColumnKey, string>> // detectedColumnKey → source header name
  unmappedHeaders: string[]
  missingColumns: ColumnKey[] // required cols not detected
}

const REQUIRED_COLS: ColumnKey[] = ['firstName', 'lastName']

/**
 * Normalizes a header string for alias comparison. Case-insensitive,
 * strips whitespace and Romanian diacritics, flattens separators.
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[._\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  // CNP is declared BEFORE companyEmployeeId so that in the "contains"
  // fallback a header like "Cod personal angajat" resolves to cnp rather
  // than being grabbed by companyEmployeeId's very short `id` alias.
  // 'c.n.p.' normalizes to 'c n p'. Exact matches always win, so a plain
  // "CNP" column is never mistaken for an employee id.
  cnp: ['cnp', 'cod numeric personal', 'cod personal', 'c n p', 'personal number'],
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
  email: ['email', 'e-mail', 'mail', 'adresa email', 'email address', 'adresa de email'],
  department: [
    'departament',
    'department',
    'sectie',
    'sectia',
    'compartiment',
    'birou',
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
  city: ['oras', 'orasul', 'localitate', 'localitatea', 'city', 'town', 'stadt', 'wohnort'],
  companyName: [
    'nume_companie',
    'nume companie',
    'companie',
    'firma',
    'denumire firma',
    'denumire companie',
    'company',
    'company name',
    'angajator',
    'employer',
  ],
  cui: [
    'cui',
    'cui_companie',
    'cui companie',
    'cod fiscal',
    'codul fiscal',
    'cif',
    'tax id',
    'vat',
  ],
  companyAddress: [
    'adresa_companie',
    'adresa companie',
    'adresa firma',
    'company address',
    'sediu',
    'sediu social',
  ],
  // `locatie`/`location` moved here from `city`: in Romanian HR exports it
  // means the work location (loc de muncă), not the town. `sector` is safe
  // to add (it does not collide with department's `sectie`/`sectia`); we do
  // NOT add `sectie` here because that alias already belongs to department.
  workplaceName: [
    'loc_de_munca',
    'loc de munca',
    'locul de munca',
    'loc munca',
    'punct de lucru',
    'punct lucru',
    'work location',
    'work site',
    'locatie munca',
    'locatie',
    'locatia',
    'location',
    'sector',
    'workplace',
  ],
  hireDate: [
    'data angajarii',
    'data angaj',
    'data angajare',
    'angajat la',
    'hire date',
    'start date',
    'eintrittsdatum',
  ],
  fitnessValidUntil: [
    'expirare fisa aptitudine',
    'expirare fisa',
    'valabil pana la',
    'data expirare',
    'scadenta',
    'urmatorul control',
    'valid until',
  ],
  // Split fitness-expiry columns (APAPROD: "ZIUA EXP." / "LUNA EXP." /
  // "ANUL EXP."). All aliases keep the exp/expirare token so they can't be
  // mistaken for a stray day/month/year column elsewhere in the sheet.
  fitnessValidUntilDay: ['ziua exp', 'zi exp', 'ziua expirarii', 'zi expirare', 'expiry day'],
  fitnessValidUntilMonth: ['luna exp', 'luna expirarii', 'luna expirare', 'expiry month'],
  fitnessValidUntilYear: ['anul exp', 'an exp', 'anul expirarii', 'an expirare', 'expiry year'],
  notes: ['mentiuni', 'observatii', 'obs', 'note', 'notes', 'remarks'],
}

function detectColumn(header: string): ColumnKey | null {
  const norm = normalizeHeader(header)
  if (!norm) return null

  // Prefer exact matches over partial matches. Tied scores resolved by
  // alias ordering (first wins).
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[ColumnKey, string[]]>) {
    for (const alias of aliases) {
      if (norm === alias) return key
    }
  }
  // Fall back to "contains" matching — useful for headers like
  // "Nume / Prenume" or "ID angajat (marca)".
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[ColumnKey, string[]]>) {
    for (const alias of aliases) {
      if (norm.includes(alias)) return key
    }
  }
  return null
}

/**
 * Resolves a list of header strings into a ColumnMapping. If both "nume"
 * and "prenume" headers are present, "nume" → lastName (the default alias
 * ordering already does that). Header collisions (two headers mapping to
 * the same key) send the later header to `unmappedHeaders`.
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

// ───────────────────────── Matrix pipeline (spec §6) ────────────────────

type Matrix = string[][]

interface SheetData {
  name: string
  matrix: Matrix
}

const HEADER_SCAN_LIMIT = 15

/**
 * A row is accepted as the header row when its cells, run through the
 * alias resolver, yield BOTH firstName and lastName. That is strong enough
 * to reject stray title rows ("2026", a single merged company name) while
 * matching every realistic employee-roster header.
 */
function rowLooksLikeHeader(cells: string[]): boolean {
  if (cells.filter((c) => c.trim() !== '').length < 2) return false
  const m = resolveMapping(cells.map((c) => c.trim()))
  return !m.missingColumns.includes('firstName') && !m.missingColumns.includes('lastName')
}

/** Returns the index of the header row within the first rows, or -1. */
function detectHeaderRow(matrix: Matrix): number {
  const limit = Math.min(HEADER_SCAN_LIMIT, matrix.length)
  for (let i = 0; i < limit; i++) {
    if (rowLooksLikeHeader(matrix[i])) return i
  }
  return -1
}

/**
 * Turns raw header cells into unique, non-empty header names. Blank header
 * cells that nonetheless sit above data become "Coloana N" so their values
 * surface as unmapped columns instead of vanishing. Duplicate names get a
 * disambiguating suffix.
 */
function materializeHeaders(cells: string[]): string[] {
  const seen = new Map<string, number>()
  return cells.map((raw, i) => {
    const base = raw.trim() || `Coloana ${i + 1}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base} (${n + 1})`
  })
}

/** True for single-cell separator bands (months, years, "SUSPENDAT", …). */
function isSeparatorRow(cells: string[]): boolean {
  return cells.filter((c) => c.trim() !== '').length <= 1
}

/**
 * True when a mid-sheet row simply repeats the header (common when an
 * export concatenates several blocks). Compared on normalized labels.
 */
function isRepeatedHeaderRow(cells: string[], headerCells: string[]): boolean {
  if (!rowLooksLikeHeader(cells)) return false
  const norm = (arr: string[]) =>
    arr
      .map((c) => normalizeHeader(c))
      .filter(Boolean)
      .join('|')
  return norm(cells) === norm(headerCells)
}

interface SheetRecords {
  name: string
  headerCells: string[] // materialized header names
  mapping: ColumnMapping
  records: Record<string, string>[]
}

/**
 * Extracts data records from one sheet. Returns null when no header row is
 * found (the sheet is ignored by the caller, with a note).
 */
function sheetToRecords(sheet: SheetData): SheetRecords | null {
  const headerIndex = detectHeaderRow(sheet.matrix)
  if (headerIndex < 0) return null

  const rawHeaderCells = sheet.matrix[headerIndex].map((c) => c.trim())
  const headerCells = materializeHeaders(sheet.matrix[headerIndex])
  const mapping = resolveMapping(headerCells)

  const records: Record<string, string>[] = []
  for (let i = headerIndex + 1; i < sheet.matrix.length; i++) {
    const cells = sheet.matrix[i].map((c) => c.trim())
    if (isSeparatorRow(cells)) continue
    if (isRepeatedHeaderRow(cells, rawHeaderCells)) continue
    const record: Record<string, string> = {}
    for (let j = 0; j < headerCells.length; j++) {
      record[headerCells[j]] = cells[j] ?? ''
    }
    records.push(record)
  }
  return { name: sheet.name, headerCells, mapping, records }
}

function extract(
  mapping: ColumnMapping,
  record: Record<string, string>,
  col: ColumnKey
): string | null {
  const header = mapping.detected[col]
  if (!header) return null
  const v = record[header]
  if (v === undefined || v === null) return null
  const trimmed = String(v).trim()
  return trimmed === '' ? null : trimmed
}

function recordToRawRow(
  mapping: ColumnMapping,
  record: Record<string, string>,
  rowNumber: number,
  sheetName: string | null
): RawRow {
  const cnpRaw = extract(mapping, record, 'cnp')
  return {
    rowNumber,
    sheetName,
    firstName: extract(mapping, record, 'firstName'),
    lastName: extract(mapping, record, 'lastName'),
    cnp: cnpRaw ? normalizeCnpInput(cnpRaw) : null,
    companyEmployeeId: extract(mapping, record, 'companyEmployeeId'),
    email: extract(mapping, record, 'email'),
    department: extract(mapping, record, 'department'),
    jobTitle: extract(mapping, record, 'jobTitle'),
    city: extract(mapping, record, 'city'),
    companyName: extract(mapping, record, 'companyName'),
    cui: extract(mapping, record, 'cui'),
    companyAddress: extract(mapping, record, 'companyAddress'),
    workplaceName: extract(mapping, record, 'workplaceName'),
    hireDate: extract(mapping, record, 'hireDate'),
    // Single column if present, else assembled from the ZIUA/LUNA/ANUL EXP.
    // split columns (spec §3, APAPROD layout).
    fitnessValidUntil:
      extract(mapping, record, 'fitnessValidUntil') ??
      combineDateParts(
        extract(mapping, record, 'fitnessValidUntilDay'),
        extract(mapping, record, 'fitnessValidUntilMonth'),
        extract(mapping, record, 'fitnessValidUntilYear')
      ),
    notes: extract(mapping, record, 'notes'),
    raw: record,
  }
}

/** Converts a single spreadsheet cell to a canonical string. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    // Excel-native dates come back as a Date at the calendar day the user
    // sees; emit ISO yyyy-mm-dd using LOCAL getters so a timezone behind
    // UTC doesn't shift the day.
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') {
    // Integer magnitudes we care about (IDs, 13-digit CNPs) stay plain —
    // never scientific notation within JS's safe-integer range.
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : ''
  return String(v)
}

/**
 * Parses a CSV string into a single-sheet matrix. Auto-detects delimiter
 * (comma / semicolon / tab / pipe). Header-row detection and empty-row
 * skipping happen later in the shared matrix pipeline.
 */
function parseCsvMatrix(text: string): { matrix: Matrix; errors: string[] } {
  const cleaned = text.replace(/^﻿/, '') // strip UTF-8 BOM
  const result = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  })
  return {
    matrix: (result.data ?? []).map((row) =>
      (Array.isArray(row) ? row : []).map((c) => cellToString(c))
    ),
    errors: result.errors.map((e) => `Row ${e.row}: ${e.message}`),
  }
}

/**
 * Reads every sheet of an XLSX/XLS workbook into matrices. `cellDates`
 * makes Excel-native dates come back as Date objects (spec §2/§3).
 */
async function parseXlsxSheets(
  buffer: ArrayBuffer
): Promise<{ sheets: SheetData[]; errors: string[] }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  if (wb.SheetNames.length === 0) {
    return { sheets: [], errors: ['No sheets in workbook'] }
  }
  const sheets: SheetData[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: true,
    })
    const matrix = aoa.map((row) => (Array.isArray(row) ? row : []).map((c) => cellToString(c)))
    return { name, matrix }
  })
  return { sheets, errors: [] }
}

/**
 * Top-level entry: takes raw text or buffer, returns mapped rows cumulated
 * across every recognized sheet. Async because XLSX parsing dynamically
 * imports its lib.
 *
 * `mapping`/`unmappedHeaders` describe the FIRST recognized sheet (that is
 * what the override UI edits). `sheetNotes` carries human-readable notes
 * about sheets that were read or skipped.
 */
export async function parseImportFile(
  input: { text: string } | { buffer: ArrayBuffer; filename: string }
): Promise<{
  mapping: ColumnMapping
  rows: RawRow[]
  parseErrors: string[]
  sheetNotes: string[]
}> {
  let sheets: SheetData[]
  let parseErrors: string[]

  if ('text' in input) {
    const { matrix, errors } = parseCsvMatrix(input.text)
    sheets = [{ name: 'CSV', matrix }]
    parseErrors = errors
  } else {
    const lower = input.filename.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const r = await parseXlsxSheets(input.buffer)
      sheets = r.sheets
      parseErrors = r.errors
    } else {
      const text = new TextDecoder('utf-8').decode(input.buffer)
      const { matrix, errors } = parseCsvMatrix(text)
      sheets = [{ name: 'CSV', matrix }]
      parseErrors = errors
    }
  }

  const multiSheet = sheets.length > 1
  const sheetNotes: string[] = []
  const recognized: SheetRecords[] = []

  for (const sheet of sheets) {
    const r = sheetToRecords(sheet)
    if (!r) {
      if (multiSheet) {
        sheetNotes.push(`Foaia „${sheet.name}" a fost ignorată (fără antet recunoscut).`)
      }
      continue
    }
    recognized.push(r)
    if (multiSheet) {
      sheetNotes.push(`Foaia „${sheet.name}": ${r.records.length} rânduri.`)
    }
  }

  // Canonical mapping = first recognized sheet (the one the override UI edits).
  const canonical = recognized[0]
  const mapping: ColumnMapping = canonical
    ? canonical.mapping
    : { detected: {}, unmappedHeaders: [], missingColumns: [...REQUIRED_COLS] }

  const rows: RawRow[] = []
  let rowNumber = 2 // keep the "header = row 1" feel for the first sheet
  for (const sheetRecords of recognized) {
    const sheetName = multiSheet ? sheetRecords.name : null
    for (const record of sheetRecords.records) {
      // Each sheet is extracted with ITS OWN mapping so data stays correct
      // even if a later sheet's columns differ from the canonical header.
      rows.push(recordToRawRow(sheetRecords.mapping, record, rowNumber, sheetName))
      rowNumber++
    }
  }

  return { mapping, rows, parseErrors, sheetNotes }
}

export interface AiColumnMappingResult {
  mapping: ColumnMapping
  aiUsed: boolean
  confidence: Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>>
}

/**
 * Enhances fuzzy column mapping with AI when ≥2 required columns are undetected.
 * Only column header names are sent to the API — never actual row data
 * (import spec §1: the CNP value must never reach the AI endpoint).
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
  const mergedDetected: Partial<Record<ColumnKey, string>> = {
    ...fuzzyMapping.detected,
  }
  const mergedConfidence: Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>> = {}
  const stillUnmapped: string[] = []

  for (const header of fuzzyMapping.unmappedHeaders) {
    const aiKey = json.mapping?.[header] as ColumnKey | null | undefined
    if (
      aiKey &&
      typeof aiKey === 'string' &&
      (ASSIGNABLE_COLUMN_KEYS as string[]).includes(aiKey) &&
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
    mapping: {
      detected: mergedDetected,
      unmappedHeaders: stillUnmapped,
      missingColumns,
    },
    aiUsed: true,
    confidence: mergedConfidence,
  }
}

/**
 * Row-level validation. Returns `issues` (block the row) and `warnings`
 * (row still imports). The only blocking issues are a missing first/last
 * name and a malformed email — everything else (bad CNP, odd dates, no
 * workplace) is a non-fatal warning so a messy real-world file still
 * lands as much data as possible (import spec §1, §2, §3, §5).
 *
 * We DELIBERATELY do not validate the workplace against the live DB here —
 * that's done server-side. The client validation only catches shape
 * problems.
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

  // CNP — invalid never blocks; the employee imports without a CNP.
  if (row.cnp && !validateCnp(row.cnp).valid) {
    warnings.push('cnp_invalid')
  }

  // Hire date — a garbage or future date is dropped with a warning.
  if (row.hireDate) {
    const parsed = parseFlexibleDate(row.hireDate)
    if (parsed.status === 'invalid') warnings.push('hire_date_invalid')
    else if (parsed.status === 'valid' && isFutureDate(parsed.date))
      warnings.push('hire_date_future')
  }

  // Fitness-certificate expiry — a past date is fine (overdue recall); only
  // an unparseable value warns.
  if (row.fitnessValidUntil) {
    const parsed = parseFlexibleDate(row.fitnessValidUntil)
    if (parsed.status === 'invalid') warnings.push('fitness_date_invalid')
  }

  // No workplace AND no department — the employee lands without an
  // assignment (spec §5.3). Renamed from the old `no_department`.
  if (!row.workplaceName && !row.department) {
    warnings.push('no_workplace')
  }

  return { rowNumber: row.rowNumber, issues, warnings }
}

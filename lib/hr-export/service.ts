/**
 * HR export service.
 *
 * Generates downloadable files in four formats expected by Romanian HR
 * systems. Each format has specific column layouts, delimiters, and
 * verdict value mappings documented by the target system vendors.
 *
 * Data in: HrExportEmployee[] — safe, no medical/PII fields.
 * Data out: { buffer, filename, contentType, extension }
 */

import * as XLSX from 'xlsx'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'

export type HrExportFormat = 'charisma' | 'nexus' | 'pluriva' | 'generic'

export interface HrExportEmployee {
  companyEmployeeId: string | null
  lastName: string
  firstName: string
  jobTitle: string | null
  workplace: string | null
  lastExamDate: Date | null       // completedAt of last signed exam
  verdict: string | null          // raw Buzomed verdict: apt | apt_conditionat | inapt_temporar | inapt | null
  nextDueDate: Date | null
  notes?: string | null
}

interface ExportResult {
  buffer: Buffer
  filename: string
  contentType: string
  extension: string
}

// ─────────────────────────────────────────────────────────────────
// Verdict maps
// ─────────────────────────────────────────────────────────────────

function verdictCharisma(v: string | null): string {
  switch (v) {
    case 'apt': return 'APT'
    case 'apt_conditionat': return 'APT CONDITIONAT'
    case 'inapt_temporar': return 'INAPT TEMPORAR'
    case 'inapt': return 'INAPT'
    default: return 'LIPSĂ EXAMINARE'
  }
}

function verdictNexus(v: string | null): string {
  switch (v) {
    case 'apt': return 'FIT'
    case 'apt_conditionat': return 'FIT_CONDITIONAL'
    case 'inapt_temporar': return 'UNFIT_TEMPORARY'
    case 'inapt': return 'UNFIT'
    default: return 'MISSING'
  }
}

function verdictPluriva(v: string | null): string {
  switch (v) {
    case 'apt': return 'Apt'
    case 'apt_conditionat': return 'Apt conditionat'
    case 'inapt_temporar': return 'Inapt temporar'
    case 'inapt': return 'Inapt'
    default: return 'Lipsă examinare'
  }
}

function verdictGeneric(v: string | null): string {
  switch (v) {
    case 'apt': return 'Apt'
    case 'apt_conditionat': return 'Apt condiționat'
    case 'inapt_temporar': return 'Inapt temporar'
    case 'inapt': return 'Inapt'
    default: return 'Lipsă examinare'
  }
}

// ─────────────────────────────────────────────────────────────────
// Date formatting helpers
// ─────────────────────────────────────────────────────────────────

function isoDate(d: Date | null): string {
  if (!d) return ''
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function employeeStatus(emp: HrExportEmployee): string {
  if (!emp.nextDueDate) return 'Lipsă examinare'
  const now = new Date()
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  if (emp.nextDueDate < now) return 'Expirat'
  if (emp.nextDueDate <= thirtyDays) return 'Expiră curând'
  return 'Apt'
}

// ─────────────────────────────────────────────────────────────────
// Format generators
// ─────────────────────────────────────────────────────────────────

function buildCharismaRows(employees: HrExportEmployee[]): CsvRow[] {
  const header: CsvRow = [
    'CodAngajat', 'NumePrenume', 'DataNasterii', 'Functie', 'Departament',
    'DataExaminare', 'Rezultat', 'DataScadenta', 'Observatii',
  ]
  const rows: CsvRow[] = employees.map((emp, i) => [
    emp.companyEmployeeId ?? String(i + 1),
    `${emp.lastName} ${emp.firstName}`.trim(),
    '',  // DataNasterii — not stored/exported per data security policy
    emp.jobTitle ?? '',
    emp.workplace ?? '',
    emp.lastExamDate ? isoDate(emp.lastExamDate) : '',
    verdictCharisma(emp.verdict),
    emp.nextDueDate ? isoDate(emp.nextDueDate) : '',
    emp.notes ?? '',
  ])
  return [header, ...rows]
}

function buildNexusRows(employees: HrExportEmployee[]): CsvRow[] {
  const header: CsvRow = [
    'employee_code', 'last_name', 'first_name', 'job_title',
    'exam_date', 'fitness_result', 'valid_until', 'notes',
  ]
  const rows: CsvRow[] = employees.map((emp, i) => [
    emp.companyEmployeeId ?? String(i + 1),
    emp.lastName,
    emp.firstName,
    emp.jobTitle ?? '',
    emp.lastExamDate ? isoDate(emp.lastExamDate) : '',
    verdictNexus(emp.verdict),
    emp.nextDueDate ? isoDate(emp.nextDueDate) : '',
    emp.notes ?? '',
  ])
  return [header, ...rows]
}

function buildPlurivaRows(employees: HrExportEmployee[]): CsvRow[] {
  const header: CsvRow = [
    'Marca', 'Nume', 'Prenume', 'Functie',
    'DataControlului', 'Aptitudine', 'DataExpirarii', 'Observatii',
  ]
  const rows: CsvRow[] = employees.map((emp, i) => [
    emp.companyEmployeeId ?? String(i + 1),
    emp.lastName,
    emp.firstName,
    emp.jobTitle ?? '',
    emp.lastExamDate ? isoDate(emp.lastExamDate) : '',
    verdictPluriva(emp.verdict),
    emp.nextDueDate ? isoDate(emp.nextDueDate) : '',
    emp.notes ?? '',
  ])
  return [header, ...rows]
}

function buildGenericXlsx(employees: HrExportEmployee[], companyName: string): Buffer {
  const headers = [
    'Nr.Crt', 'Cod angajat', 'Nume', 'Prenume', 'Funcție',
    'Loc de muncă', 'Data ultimei examinări', 'Verdict',
    'Scadență următoare', 'Status', 'Observații',
  ]

  const dataRows = employees.map((emp, i) => [
    i + 1,
    emp.companyEmployeeId ?? '',
    emp.lastName,
    emp.firstName,
    emp.jobTitle ?? '',
    emp.workplace ?? '',
    emp.lastExamDate ? isoDate(emp.lastExamDate) : '',
    verdictGeneric(emp.verdict),
    emp.nextDueDate ? isoDate(emp.nextDueDate) : '',
    employeeStatus(emp),
    emp.notes ?? '',
  ])

  const aoa = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Column widths: header length + 6 padding, minimum 10
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 6, 10) }))

  const wb = XLSX.utils.book_new()
  wb.Props = { Title: `HR Export — ${companyName}` }
  XLSX.utils.book_append_sheet(wb, ws, 'HR Export')

  const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
  return Buffer.from(raw)
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function generateHrExport(
  employees: HrExportEmployee[],
  format: HrExportFormat,
  companyName: string
): ExportResult {
  const today = new Date().toISOString().slice(0, 10)
  const safeName = sanitizeFilename(companyName)

  switch (format) {
    case 'charisma': {
      const csv = renderCsv(buildCharismaRows(employees), ';')
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        filename: `export_hr_charisma_${safeName}_${today}.csv`,
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      }
    }
    case 'nexus': {
      const csv = renderCsv(buildNexusRows(employees), ';')
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        filename: `export_hr_nexus_${safeName}_${today}.csv`,
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      }
    }
    case 'pluriva': {
      const csv = renderCsv(buildPlurivaRows(employees), ',')
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        filename: `export_hr_pluriva_${safeName}_${today}.csv`,
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      }
    }
    case 'generic': {
      const buffer = buildGenericXlsx(employees, companyName)
      return {
        buffer,
        filename: `export_hr_universal_${safeName}_${today}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      }
    }
  }
}

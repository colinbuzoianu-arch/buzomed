#!/usr/bin/env node
/**
 * Session 11 i18n — three concerns in one script:
 *
 *   1. RENAME: employees.table.companyEmployeeId from "Marca" → "ID angajat" (ro)
 *              employees.form.fieldCompanyEmployeeId from "Marca / număr de legitimație" → "ID angajat"
 *      The RENAMES are forced (overwrite existing) so re-running this
 *      script is idempotent — it'll just re-set the same values.
 *
 *   2. ADD: common.close (used by mobile drawer), employees.importButton,
 *           plus the entire employees.import.* namespace for the bulk
 *           import flow (~40 keys per locale).
 *
 *   3. NO REMOVALS: existing keys stay. The Marca strings get
 *      OVERWRITTEN with new values, not deleted.
 *
 * Usage: node scripts/merge-i18n-session-11.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const FILES = {
  ro: path.join(projectRoot, 'messages/ro.json'),
  en: path.join(projectRoot, 'messages/en.json'),
}

// Forced overwrites: these existing keys must be reset to new values.
// Keyed by dotted path. The script applies them after the merge.
const FORCED_RENAMES = {
  ro: {
    'employees.table.companyEmployeeId': 'ID angajat',
    'employees.form.fieldCompanyEmployeeId': 'ID angajat',
  },
  en: {
    'employees.table.companyEmployeeId': 'Employee ID',
    'employees.form.fieldCompanyEmployeeId': 'Employee ID',
  },
}

const additions = {
  ro: {
    common: {
      close: 'Închide',
    },
    employees: {
      importButton: 'Importă',
      import: {
        title: 'Import angajați',
        subtitle:
          'Încarcă un fișier CSV sau Excel cu angajații unei companii.',
        backToList: 'Înapoi la angajați',
        noCompanies:
          'Nu există companii active. Creează una înainte de a importa.',
        createCompany: 'Creează companie',
        stepCompany: 'Alege compania',
        stepFile: 'Încarcă fișierul',
        stepPreview: 'Verifică',
        stepConfirm: 'Importă',
        companyLabel: 'Companie destinație',
        companyPlaceholder: '— alege —',
        companyHelp:
          'Toți angajații din fișier vor fi adăugați la această companie. Departamentul din fișier va corespunde unui loc de muncă existent.',
        fileLabel: 'Fișier (CSV sau Excel)',
        fileHelp:
          'CSV cu separator virgulă sau punct-și-virgulă, sau fișier Excel (.xlsx). UTF-8 pentru diacritice.',
        fileFormatHelp: 'Ce format trebuie să aibă fișierul?',
        downloadTemplate: 'Descarcă șablon CSV',
        previewTitle: 'Previzualizare',
        previewSubtitle: 'Verifică datele înainte de a importa.',
        rowsTotal: 'Total rânduri',
        rowsValid: 'Valide',
        rowsWithIssues: 'Cu erori',
        rowsDuplicate: 'Duplicate',
        colRow: 'Rând',
        colStatus: 'Status',
        colFirstName: 'Prenume',
        colLastName: 'Nume',
        colEmployeeId: 'ID angajat',
        colEmail: 'Email',
        colDepartment: 'Departament',
        statusOk: '✓ OK',
        statusDuplicate: 'Duplicat',
        statusIssue: 'Eroare',
        statusWarning: 'Atenție',
        issueMissingFirstName: 'Prenumele lipsește',
        issueMissingLastName: 'Numele lipsește',
        issueInvalidEmail: 'Email invalid',
        issueWorkplaceNotFound:
          'Departamentul nu corespunde unui loc de muncă existent la această companie',
        warningNoDepartment:
          'Departament nespecificat — angajatul va fi creat fără atribuire',
        warningDuplicateEmployee:
          'Duplicat în fișier (același nume sau email)',
        skipDuplicates:
          'Sari peste duplicate (angajați existenți în cabinet)',
        importAnywayDuplicates: 'Importă duplicatele oricum',
        mappingDetected: 'Coloane detectate',
        mappingMissing: 'Coloane obligatorii lipsă',
        mappingUnmapped: 'Coloane neutilizate',
        commitButton: 'Importă',
        committing: 'Se importă…',
        resetButton: 'Resetează',
        resultSuccess: 'Import finalizat',
        resultSummary:
          'Din {total} rânduri: {created} create, {skipped} sărite, {failed} eșuate.',
        errorParse:
          'Nu am putut citi fișierul. Verifică formatul și încearcă din nou.',
        errorCommit: 'Importul a eșuat. Încearcă din nou.',
        errorNoFile: 'Selectează un fișier',
        errorNoCompany: 'Alege o companie mai întâi',
        errorNoValidRows: 'Nu există rânduri valide de importat',
      },
    },
  },
  en: {
    common: {
      close: 'Close',
    },
    employees: {
      importButton: 'Import',
      import: {
        title: 'Import employees',
        subtitle: 'Upload a CSV or Excel file with employees for a company.',
        backToList: 'Back to employees',
        noCompanies:
          'No active companies. Create one before importing.',
        createCompany: 'Create company',
        stepCompany: 'Choose company',
        stepFile: 'Upload file',
        stepPreview: 'Review',
        stepConfirm: 'Import',
        companyLabel: 'Destination company',
        companyPlaceholder: '— select —',
        companyHelp:
          'All employees in the file will be added to this company. The department in the file must match an existing workplace.',
        fileLabel: 'File (CSV or Excel)',
        fileHelp:
          'CSV with comma or semicolon separator, or Excel (.xlsx) file. UTF-8 for diacritics.',
        fileFormatHelp: 'What format does the file need?',
        downloadTemplate: 'Download CSV template',
        previewTitle: 'Preview',
        previewSubtitle: 'Review the data before importing.',
        rowsTotal: 'Total rows',
        rowsValid: 'Valid',
        rowsWithIssues: 'With errors',
        rowsDuplicate: 'Duplicates',
        colRow: 'Row',
        colStatus: 'Status',
        colFirstName: 'First name',
        colLastName: 'Last name',
        colEmployeeId: 'Employee ID',
        colEmail: 'Email',
        colDepartment: 'Department',
        statusOk: '✓ OK',
        statusDuplicate: 'Duplicate',
        statusIssue: 'Error',
        statusWarning: 'Warning',
        issueMissingFirstName: 'First name is missing',
        issueMissingLastName: 'Last name is missing',
        issueInvalidEmail: 'Invalid email',
        issueWorkplaceNotFound:
          "Department doesn't match an existing workplace at this company",
        warningNoDepartment:
          'No department — employee will be created without assignment',
        warningDuplicateEmployee:
          'Duplicate within file (same name or email)',
        skipDuplicates:
          'Skip duplicates (employees already in the cabinet)',
        importAnywayDuplicates: 'Import duplicates anyway',
        mappingDetected: 'Detected columns',
        mappingMissing: 'Missing required columns',
        mappingUnmapped: 'Unused columns',
        commitButton: 'Import',
        committing: 'Importing…',
        resetButton: 'Reset',
        resultSuccess: 'Import complete',
        resultSummary:
          'Of {total} rows: {created} created, {skipped} skipped, {failed} failed.',
        errorParse:
          "Couldn't read the file. Check the format and try again.",
        errorCommit: 'Import failed. Try again.',
        errorNoFile: 'Select a file',
        errorNoCompany: 'Choose a company first',
        errorNoValidRows: 'No valid rows to import',
      },
    },
  },
}

let totalAdded = 0
let totalKept = 0
let totalRenamed = 0

function deepMerge(target, source, pathSoFar = '') {
  for (const key of Object.keys(source)) {
    const fullPath = pathSoFar ? `${pathSoFar}.${key}` : key
    const sv = source[key]
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      deepMerge(target[key], sv, fullPath)
    } else {
      if (key in target) {
        totalKept++
      } else {
        target[key] = sv
        totalAdded++
        console.log(`  + ${fullPath}`)
      }
    }
  }
}

function setByPath(obj, dottedPath, value) {
  const parts = dottedPath.split('.')
  let cursor = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') {
      cursor[parts[i]] = {}
    }
    cursor = cursor[parts[i]]
  }
  const last = parts[parts.length - 1]
  if (cursor[last] !== value) {
    cursor[last] = value
    return true
  }
  return false
}

for (const [locale, filePath] of Object.entries(FILES)) {
  console.log(`\n── ${locale} (${path.relative(projectRoot, filePath)}) ──`)
  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ File not found: ${filePath}`)
    process.exit(1)
  }
  const before = totalAdded
  const renamedBefore = totalRenamed
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  deepMerge(data, additions[locale])

  // Apply forced renames
  for (const [dottedPath, value] of Object.entries(FORCED_RENAMES[locale])) {
    if (setByPath(data, dottedPath, value)) {
      totalRenamed++
      console.log(`  ↻ ${dottedPath} = "${value}"`)
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(
    `  ✓ Wrote ${filePath} — +${totalAdded - before} added, ${totalRenamed - renamedBefore} renamed.`
  )
}

console.log(
  `\nDone. Added ${totalAdded} new keys, renamed ${totalRenamed} existing keys. Kept ${totalKept} others untouched.`
)

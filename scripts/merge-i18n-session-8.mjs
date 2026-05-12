#!/usr/bin/env node
/**
 * Buzomed session 8 — merge new i18n keys for CNP encryption + UI.
 *
 * Adds:
 *   - employees.form.fieldIdDocumentTypeCnp (was previously deferred)
 *   - employees.form.fieldIdDocumentTypeCnpHint
 *   - employees.form.fieldCnp
 *   - employees.form.cnpBirthDateMismatch
 *   - employees.cnp.revealButton / hideButton / noPermission
 *   - employees.cnp.errorDuplicate
 *
 * Removes (no longer used after session 8):
 *   - employees.form.fieldIdDocumentTypeCnpDeferred
 *   - employees.form.cnpNotice
 *
 * Idempotent on the add side. Removal is destructive: re-running won't
 * "add back" the removed keys. That's fine — once CNP is live, you don't
 * want the "CNP not yet supported" notice to ever return.
 *
 * Usage: node scripts/merge-i18n-session-8.mjs
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

// Keys to remove. Targeted by dotted path; we walk down and delete the
// leaf. Missing paths are silently skipped.
const REMOVALS = [
  'employees.form.fieldIdDocumentTypeCnpDeferred',
  'employees.form.cnpNotice',
]

const additions = {
  ro: {
    employees: {
      form: {
        fieldIdDocumentTypeCnp: 'CNP',
        fieldIdDocumentTypeCnpHint:
          'CNP-ul este criptat în baza de date și vizibil doar medicilor.',
        fieldCnp: 'CNP',
        cnpBirthDateMismatch:
          'Atenție: data nașterii din CNP ({cnpDate}) nu corespunde cu cea introdusă mai jos.',
      },
      cnp: {
        revealButton: 'Afișează',
        hideButton: 'Ascunde',
        noPermission: '(necesită rol de medic)',
        errorDuplicate:
          'Un alt angajat cu același CNP există deja în cabinet.',
      },
      cnpError: {
        wrong_length: 'CNP-ul trebuie să aibă exact 13 cifre',
        non_numeric: 'CNP-ul trebuie să conțină doar cifre',
        invalid_gender_century_code:
          'Prima cifră a CNP-ului (sex/secol) este invalidă',
        invalid_month: 'Luna nașterii din CNP este invalidă',
        invalid_day: 'Ziua nașterii din CNP nu există',
        invalid_county_code: 'Codul județului din CNP este invalid',
        invalid_sequence: 'Numărul de secvență din CNP este invalid',
        invalid_checksum:
          'Cifra de control a CNP-ului nu corespunde — verifică numărul',
      },
    },
  },
  en: {
    employees: {
      form: {
        fieldIdDocumentTypeCnp: 'CNP (Romanian ID number)',
        fieldIdDocumentTypeCnpHint:
          'The CNP is encrypted at rest and visible only to practitioners.',
        fieldCnp: 'CNP',
        cnpBirthDateMismatch:
          "Warning: the CNP's embedded birth date ({cnpDate}) doesn't match the date entered below.",
      },
      cnp: {
        revealButton: 'Show',
        hideButton: 'Hide',
        noPermission: '(requires practitioner role)',
        errorDuplicate:
          'Another employee with the same CNP already exists in this cabinet.',
      },
      cnpError: {
        wrong_length: 'CNP must be exactly 13 digits',
        non_numeric: 'CNP must contain only digits',
        invalid_gender_century_code:
          "CNP's first digit (gender/century) is not valid",
        invalid_month: "CNP's birth month is out of range",
        invalid_day: "CNP's birth day does not exist",
        invalid_county_code: "CNP's county code is not valid",
        invalid_sequence: "CNP's sequence number is not valid",
        invalid_checksum:
          "CNP checksum doesn't match — please re-verify the number",
      },
    },
  },
}

let totalAdded = 0
let totalKept = 0
let totalRemoved = 0

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

function deleteByPath(obj, dottedPath) {
  const parts = dottedPath.split('.')
  let cursor = obj
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor?.[parts[i]]
    if (!cursor || typeof cursor !== 'object') return false
  }
  const last = parts[parts.length - 1]
  if (last in cursor) {
    delete cursor[last]
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
  const addedBefore = totalAdded
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  deepMerge(data, additions[locale])

  for (const rmPath of REMOVALS) {
    if (deleteByPath(data, rmPath)) {
      totalRemoved++
      console.log(`  - ${rmPath} (removed)`)
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(
    `  ✓ Wrote ${filePath} — added ${totalAdded - addedBefore} key(s).`
  )
}

console.log(
  `\nDone. Added ${totalAdded} new keys total, removed ${totalRemoved} obsolete keys. Kept ${totalKept} existing keys untouched.`
)

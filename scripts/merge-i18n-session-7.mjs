#!/usr/bin/env node
/**
 * Buzomed session 7 — merge new i18n keys for the documents UI.
 *
 * Adds the `documents.*` namespace (~30 keys per locale). Idempotent:
 * preserves existing keys, only adds missing ones.
 *
 * Usage: node scripts/merge-i18n-session-7.mjs
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

const additions = {
  ro: {
    documents: {
      sectionTitle: 'Documente',
      empty: 'Niciun document atașat.',
      emptyHint: 'Folosește butonul de mai sus pentru a încărca un document.',
      uploadButton: 'Încarcă document',
      uploading: 'Se încarcă…',
      delete: 'Șterge',
      deleteConfirm: 'Sigur dorești să ștergi acest document? Acțiunea nu poate fi anulată.',
      deleting: 'Se șterge…',
      download: 'Descarcă',
      opening: 'Se deschide…',
      uploadedBy: 'Încărcat de',
      uploadedOn: 'Încărcat',
      official: 'Oficial',
      generated: 'Generat',
      chooseFile: 'Selectează fișier',
      documentTypeLabel: 'Tip document',
      submit: 'Încarcă',
      errorTitle: 'Eroare',
      allowedHint: 'Tipuri acceptate: PDF, JPEG, PNG, DOCX. Maxim 15 MB.',
      types: {
        fisa_aptitudine: 'Fișă de aptitudine',
        fisa_factori_risc: 'Fișă factori de risc',
        dosarul_medical: 'Dosar medical',
        raport_medical: 'Raport medical',
        adeverinta_medicala: 'Adeverință medicală',
        vaccination_certificate: 'Certificat vaccinare',
        lab_result: 'Buletin analize',
        referral: 'Trimitere medicală',
        external_document: 'Document extern',
        other: 'Alt document',
      },
    },
  },
  en: {
    documents: {
      sectionTitle: 'Documents',
      empty: 'No documents attached yet.',
      emptyHint: 'Use the button above to upload a document.',
      uploadButton: 'Upload document',
      uploading: 'Uploading…',
      delete: 'Delete',
      deleteConfirm: 'Delete this document? This cannot be undone.',
      deleting: 'Deleting…',
      download: 'Download',
      opening: 'Opening…',
      uploadedBy: 'Uploaded by',
      uploadedOn: 'Uploaded',
      official: 'Official',
      generated: 'Generated',
      chooseFile: 'Choose file',
      documentTypeLabel: 'Document type',
      submit: 'Upload',
      errorTitle: 'Error',
      allowedHint: 'Allowed: PDF, JPEG, PNG, DOCX. Max 15 MB.',
      types: {
        fisa_aptitudine: 'Fitness certificate',
        fisa_factori_risc: 'Risk-factor sheet',
        dosarul_medical: 'Medical record',
        raport_medical: 'Medical report',
        adeverinta_medicala: 'Medical statement',
        vaccination_certificate: 'Vaccination certificate',
        lab_result: 'Lab result',
        referral: 'Referral',
        external_document: 'External document',
        other: 'Other document',
      },
    },
  },
}

let totalAdded = 0
let totalKept = 0

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

for (const [locale, filePath] of Object.entries(FILES)) {
  console.log(`\n── ${locale} (${path.relative(projectRoot, filePath)}) ──`)
  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ File not found: ${filePath}`)
    process.exit(1)
  }
  const before = totalAdded
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  deepMerge(data, additions[locale])
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`  ✓ Wrote ${filePath} — added ${totalAdded - before} key(s).`)
}

console.log(
  `\nDone. Added ${totalAdded} new keys total. Kept ${totalKept} existing keys untouched.`
)

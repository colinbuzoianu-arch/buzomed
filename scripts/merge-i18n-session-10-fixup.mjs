#!/usr/bin/env node
/**
 * Session 10 fixup — add the Scadențe tab key.
 *
 * The Programări nav link and page have been merged into the Examinări
 * page as a new tab called "Scadențe" (due dates). This script adds the
 * one new key needed:
 *
 *   - examinations.tabs.scadente (ro: "Scadențe", en: "Due")
 *
 * The existing recalls.* keys all stay — they're still used by the
 * Scadențe view inside Examinări. The nav.recalls and
 * nav.recallsOverdueTooltip keys are now unused but we leave them in
 * place rather than removing them. Future-proof: if someone wants
 * recalls back as a separate page, the strings are still there. The
 * overhead is two unused keys per locale.
 *
 * Usage: node scripts/merge-i18n-session-10-fixup.mjs
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
    examinations: {
      tabs: {
        scadente: 'Scadențe',
      },
    },
  },
  en: {
    examinations: {
      tabs: {
        scadente: 'Due',
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

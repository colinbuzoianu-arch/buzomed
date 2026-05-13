#!/usr/bin/env node
/**
 * Buzomed session 9 — merge i18n keys for the recall dashboard.
 *
 * Adds:
 *   - nav.recalls + nav.recallsOverdueTooltip
 *   - recalls.* namespace (~40 keys per locale)
 *
 * Usage: node scripts/merge-i18n-session-9.mjs
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
    nav: {
      recalls: 'Rechemări',
      recallsOverdueTooltip: '{count} rechemări întârziate',
    },
    recalls: {
      title: 'Rechemări la control',
      subtitle: 'Lucrătorii care urmează să fie chemați la un examen periodic.',
      tabs: {
        overdue: 'Întârziate',
        thisWeek: 'Săptămâna aceasta',
        thisMonth: 'Luna aceasta',
        next3Months: 'Următoarele 3 luni',
        all: 'Toate',
      },
      empty: 'Nicio rechemare în acest interval.',
      emptyOverdue:
        'Nicio rechemare întârziată. Bine făcut — cabinetul e la zi.',
      emptyButOverdueHint:
        'Există {count} rechemări întârziate în alte intervale.',
      viewOverdue: 'Vezi întârziatele',
      filterCompany: 'Filtrează după companie',
      allCompanies: 'Toate',
      colWorker: 'Lucrător',
      colCompany: 'Companie',
      colWorkplace: 'Loc de muncă',
      colExamType: 'Tip examen',
      colDueDate: 'Data scadenței',
      colDaysUntil: 'Zile',
      colActions: 'Acțiuni',
      statusOverdue: 'Întârziat',
      daysOverdue: 'cu {days} zile întârziere',
      daysUntilDue: 'peste {days} zile',
      dueToday: 'astăzi',
      scheduleButton: 'Programează',
      cancelButton: 'Anulează',
      scheduling: 'Se programează…',
      cancelling: 'Se anulează…',
      scheduleDialogTitle: 'Programează examenul pentru',
      schedulePractitioner: 'Medic',
      scheduleAt: 'Data și ora',
      scheduleAtHelp:
        'Opțional. Lasă gol pentru a crea un slot deschis.',
      submitSchedule: 'Creează examinarea',
      cancelDialogTitle: 'Anulează rechemarea pentru',
      cancelReasonLabel: 'Motiv (opțional)',
      cancelReasonPlaceholder: 'ex: lucrătorul a părăsit compania',
      submitCancel: 'Confirmă anularea',
      errorMessage: 'A apărut o eroare. Încearcă din nou.',
    },
  },
  en: {
    nav: {
      recalls: 'Recalls',
      recallsOverdueTooltip: '{count} overdue recall(s)',
    },
    recalls: {
      title: 'Examination recalls',
      subtitle: 'Workers due for their next periodic examination.',
      tabs: {
        overdue: 'Overdue',
        thisWeek: 'This week',
        thisMonth: 'This month',
        next3Months: 'Next 3 months',
        all: 'All',
      },
      empty: 'No recalls in this range.',
      emptyOverdue:
        'No overdue recalls. Nicely done — the cabinet is on top of things.',
      emptyButOverdueHint:
        'There are {count} overdue recalls in other ranges.',
      viewOverdue: 'View overdue',
      filterCompany: 'Filter by company',
      allCompanies: 'All',
      colWorker: 'Worker',
      colCompany: 'Company',
      colWorkplace: 'Workplace',
      colExamType: 'Exam type',
      colDueDate: 'Due date',
      colDaysUntil: 'Days',
      colActions: 'Actions',
      statusOverdue: 'Overdue',
      daysOverdue: '{days} days late',
      daysUntilDue: 'in {days} days',
      dueToday: 'today',
      scheduleButton: 'Schedule',
      cancelButton: 'Cancel',
      scheduling: 'Scheduling…',
      cancelling: 'Cancelling…',
      scheduleDialogTitle: 'Schedule examination for',
      schedulePractitioner: 'Practitioner',
      scheduleAt: 'Date and time',
      scheduleAtHelp:
        'Optional. Leave empty to create an open slot.',
      submitSchedule: 'Create examination',
      cancelDialogTitle: 'Cancel recall for',
      cancelReasonLabel: 'Reason (optional)',
      cancelReasonPlaceholder: 'e.g. worker left the company',
      submitCancel: 'Confirm cancellation',
      errorMessage: 'Something went wrong. Please try again.',
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

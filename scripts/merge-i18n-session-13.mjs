#!/usr/bin/env node
/**
 * Session 13 i18n merge:
 *   - dashboard.* namespace (~20 keys per locale)
 *   - examinations.fisa.downloadPdf (1 key)
 *
 * Usage: node scripts/merge-i18n-session-13.mjs
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
      dashboard: 'Acasă',
    },
    dashboard: {
      goodMorning: 'Bună dimineața',
      goodAfternoon: 'Bună ziua',
      goodEvening: 'Bună seara',
      needsAttention: 'Necesită atenție',
      overdueRecalls: 'Programări întârziate',
      overdueRecallsDesc: 'Lucrători care depășit data scadenței',
      inProgress: 'Examinări în curs',
      inProgressDesc: 'Examinări deschise, nefinalizate',
      unsignedFise: 'Fișe nesemnate',
      unsignedFiseDesc: 'Examinări finalizate fără semnătură',
      today: 'Astăzi',
      scheduledToday: 'Programate azi',
      dueThisWeek: 'Scadente săptămâna aceasta',
      thisMonthExams: 'Luna aceasta',
      activeWorkers: 'Angajați activi',
      quickActions: 'Acțiuni rapide',
      viewScadente: 'Vezi scadențe',
      companies: 'companii',
      employees: 'angajați',
      viewFullReport: 'Raport complet',
    },
    examinations: {
      fisa: {
        downloadPdf: 'Descarcă PDF',
      },
    },
  },
  en: {
    nav: {
      dashboard: 'Home',
    },
    dashboard: {
      goodMorning: 'Good morning',
      goodAfternoon: 'Good afternoon',
      goodEvening: 'Good evening',
      needsAttention: 'Needs attention',
      overdueRecalls: 'Overdue recalls',
      overdueRecallsDesc: 'Workers past their due date',
      inProgress: 'In-progress exams',
      inProgressDesc: 'Open examinations not yet completed',
      unsignedFise: 'Unsigned fișe',
      unsignedFiseDesc: 'Completed examinations without a signature',
      today: 'Today',
      scheduledToday: 'Scheduled today',
      dueThisWeek: 'Due this week',
      thisMonthExams: 'This month',
      activeWorkers: 'Active workers',
      quickActions: 'Quick actions',
      viewScadente: 'View due dates',
      companies: 'companies',
      employees: 'employees',
      viewFullReport: 'Full report',
    },
    examinations: {
      fisa: {
        downloadPdf: 'Download PDF',
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
  console.log(`  ✓ +${totalAdded - before} keys added.`)
}

console.log(`\nDone. Added ${totalAdded} new keys. Kept ${totalKept} untouched.`)

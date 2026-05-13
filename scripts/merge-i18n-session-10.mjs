#!/usr/bin/env node
/**
 * Buzomed session 10 — merge i18n keys for the reports module.
 *
 * Adds:
 *   - nav.reports
 *   - companies.viewReport
 *   - examinations.exportCsv
 *   - reports.* namespace
 *   - companyReport.* namespace
 *
 * Usage: node scripts/merge-i18n-session-10.mjs
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
      reports: 'Rapoarte',
    },
    companies: {
      viewReport: 'Vezi raportul',
    },
    examinations: {
      exportCsv: 'Exportă CSV',
    },
    reports: {
      title: 'Rapoarte',
      subtitle: 'Activitatea cabinetului pe intervalul selectat.',
      empty: 'Nicio examinare în acest interval.',
      range: {
        label: 'Interval',
        thisMonth: 'Luna aceasta',
        lastMonth: 'Luna trecută',
        thisQuarter: 'Trimestrul curent',
        lastQuarter: 'Trimestrul trecut',
        thisYear: 'Anul curent',
        last12Months: 'Ultimele 12 luni',
      },
      headline: {
        title: 'Sumar',
        total: 'Total examinări',
        signed: 'Semnate',
        apt: 'Apt',
        aptConditionat: 'Apt condiționat',
        inapt_temporar: 'Inapt temporar',
        inapt: 'Inapt',
        overdueRecalls: 'Programări întârziate',
      },
      monthly: {
        title: 'Evoluție lunară',
        month: 'Lună',
      },
      perCompany: {
        title: 'Pe companie',
        company: 'Companie',
        report: 'Raport',
        viewDetail: 'Detalii',
      },
    },
    companyReport: {
      title: 'Raport companie',
      dateRange: 'Interval',
      exportCsv: 'Exportă CSV',
      print: 'Tipărește',
      tabWorkers: 'Lucrători',
      tabExaminations: 'Examinări',
      empty: 'Nicio examinare la această companie în intervalul selectat.',
      colWorker: 'Lucrător',
      colWorkplace: 'Loc de muncă',
      colLastExam: 'Ultimul examen',
      colVerdict: 'Verdict',
      colNextDue: 'Următoarea scadență',
      colStatus: 'Status',
      colNumber: 'Număr',
      colDate: 'Data',
      colExamType: 'Tip examen',
      colPractitioner: 'Medic',
      statusSigned: 'Semnat',
      statusUnsigned: 'Nesemnat',
    },
  },
  en: {
    nav: {
      reports: 'Reports',
    },
    companies: {
      viewReport: 'View report',
    },
    examinations: {
      exportCsv: 'Export CSV',
    },
    reports: {
      title: 'Reports',
      subtitle: 'Cabinet activity for the selected range.',
      empty: 'No examinations in this range.',
      range: {
        label: 'Range',
        thisMonth: 'This month',
        lastMonth: 'Last month',
        thisQuarter: 'This quarter',
        lastQuarter: 'Last quarter',
        thisYear: 'This year',
        last12Months: 'Last 12 months',
      },
      headline: {
        title: 'Summary',
        total: 'Total exams',
        signed: 'Signed',
        apt: 'Fit',
        aptConditionat: 'Fit with conditions',
        inapt_temporar: 'Temporarily unfit',
        inapt: 'Unfit',
        overdueRecalls: 'Overdue recalls',
      },
      monthly: {
        title: 'Monthly trend',
        month: 'Month',
      },
      perCompany: {
        title: 'By company',
        company: 'Company',
        report: 'Report',
        viewDetail: 'Details',
      },
    },
    companyReport: {
      title: 'Company report',
      dateRange: 'Range',
      exportCsv: 'Export CSV',
      print: 'Print',
      tabWorkers: 'Workers',
      tabExaminations: 'Examinations',
      empty: 'No examinations for this company in the selected range.',
      colWorker: 'Worker',
      colWorkplace: 'Workplace',
      colLastExam: 'Last exam',
      colVerdict: 'Verdict',
      colNextDue: 'Next due',
      colStatus: 'Status',
      colNumber: 'Number',
      colDate: 'Date',
      colExamType: 'Exam type',
      colPractitioner: 'Practitioner',
      statusSigned: 'Signed',
      statusUnsigned: 'Unsigned',
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

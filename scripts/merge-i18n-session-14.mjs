#!/usr/bin/env node
/**
 * Session 14 i18n merge:
 *   - superAdmin.stats.* — global stat cards
 *   - superAdmin.tenantsTable.* — new columns (lastActive, neverActive, users, examinations, employees)
 *   - superAdmin.demoInvite.* — the demo invite dialog
 *   - tenantDetail.activityTitle + tenantDetail.activity.*
 *   - tenantDetail.membersTable.lastSeen
 *
 * Usage: node scripts/merge-i18n-session-14.mjs
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
    superAdmin: {
      stats: {
        totalTenants: 'Total cabinete',
        activeTenants: 'Active',
        demoTenants: 'Demo',
        totalExaminations: 'Total examinări',
      },
      tenantsTable: {
        users: 'Utilizatori',
        examinations: 'Examinări',
        employees: 'Angajați',
        lastActive: 'Ultima activitate',
        neverActive: 'Niciodată',
      },
      demoInvite: {
        button: '+ Demo',
        dialogTitle: 'Trimite invitație demo',
        dialogDescription:
          'Creează un cabinet demo pre-populat și trimite o invitație practicianului. Vor primi un link pentru a se autentifica direct.',
        fieldFirstName: 'Prenume',
        fieldLastName: 'Nume',
        fieldCabinetName: 'Nume cabinet (opțional)',
        fieldCabinetNameHelp: 'Lasă gol pentru "Cabinet Demo [Nume]".',
        fieldLocale: 'Limbă email',
        submit: 'Creează și trimite invitația',
        submitting: 'Se creează…',
        successMessage: 'Cabinet demo creat și invitație trimisă!',
        errorMessage: 'A apărut o eroare. Încearcă din nou.',
        errorEmailExists: 'Există deja un utilizator cu această adresă de email.',
      },
    },
    tenantDetail: {
      activityTitle: 'Activitate',
      activity: {
        totalExams: 'Total examinări',
        examsThisMonth: 'Luna aceasta',
        thisWeek: 'săptămâna aceasta',
        signedThisMonth: 'Semnate luna aceasta',
        overdueRecalls: 'Scadențe întârziate',
        pending: 'în așteptare',
        employees: 'Angajați activi',
        companies: 'Companii',
        lastActive: 'Ultima activitate',
      },
      membersTable: {
        lastSeen: 'Ultima prezență',
      },
    },
  },
  en: {
    superAdmin: {
      stats: {
        totalTenants: 'Total tenants',
        activeTenants: 'Active',
        demoTenants: 'Demo',
        totalExaminations: 'Total examinations',
      },
      tenantsTable: {
        users: 'Users',
        examinations: 'Examinations',
        employees: 'Employees',
        lastActive: 'Last active',
        neverActive: 'Never',
      },
      demoInvite: {
        button: '+ Demo',
        dialogTitle: 'Send demo invitation',
        dialogDescription:
          'Creates a pre-populated demo cabinet and sends an invitation to the practitioner. They receive a link to sign in directly.',
        fieldFirstName: 'First name',
        fieldLastName: 'Last name',
        fieldCabinetName: 'Cabinet name (optional)',
        fieldCabinetNameHelp: 'Leave empty for "Cabinet Demo [Last name]".',
        fieldLocale: 'Email language',
        submit: 'Create and send invitation',
        submitting: 'Creating…',
        successMessage: 'Demo cabinet created and invitation sent!',
        errorMessage: 'Something went wrong. Please try again.',
        errorEmailExists: 'A user with this email already exists.',
      },
    },
    tenantDetail: {
      activityTitle: 'Activity',
      activity: {
        totalExams: 'Total examinations',
        examsThisMonth: 'This month',
        thisWeek: 'this week',
        signedThisMonth: 'Signed this month',
        overdueRecalls: 'Overdue recalls',
        pending: 'pending',
        employees: 'Active employees',
        companies: 'Companies',
        lastActive: 'Last active',
      },
      membersTable: {
        lastSeen: 'Last seen',
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
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], sv, fullPath)
    } else {
      if (key in target) { totalKept++ }
      else { target[key] = sv; totalAdded++; console.log(`  + ${fullPath}`) }
    }
  }
}

for (const [locale, filePath] of Object.entries(FILES)) {
  console.log(`\n── ${locale} ──`)
  const before = totalAdded
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  deepMerge(data, additions[locale])
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`  ✓ +${totalAdded - before} keys added.`)
}

console.log(`\nDone. Added ${totalAdded} keys total.`)

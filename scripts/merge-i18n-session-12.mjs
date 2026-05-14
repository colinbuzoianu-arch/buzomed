#!/usr/bin/env node
/**
 * Session 12 i18n merge:
 *   - forgotPassword.* namespace
 *   - resetPassword.* namespace
 *   - login.forgotPasswordLink (single new key)
 *   - team.userAdmin.* namespace
 *
 * Usage: node scripts/merge-i18n-session-12.mjs
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
    login: {
      forgotPasswordLink: 'Ai uitat parola?',
    },
    forgotPassword: {
      title: 'Recuperare parolă',
      subtitle:
        'Introdu adresa de email și îți trimitem un link pentru a-ți reseta parola.',
      submitButton: 'Trimite link-ul',
      submitting: 'Se trimite…',
      successMessage:
        'Dacă există un cont pentru această adresă, vei primi un email cu instrucțiuni în câteva minute. Verifică și folderul spam.',
      errorMessage: 'A apărut o eroare. Încearcă din nou.',
      backToLogin: 'Înapoi la autentificare',
    },
    resetPassword: {
      title: 'Setează o parolă nouă',
      subtitle: 'Introdu o parolă nouă pentru contul tău.',
      passwordLabel: 'Parolă nouă',
      confirmLabel: 'Confirmă parola',
      submitButton: 'Salvează parola',
      submitting: 'Se salvează…',
      successMessage:
        'Parola a fost actualizată. Poți să te conectezi cu noua parolă.',
      errorMessage: 'A apărut o eroare. Încearcă din nou.',
      errorMismatch: 'Parolele nu se potrivesc.',
      errorTooShort: 'Parola trebuie să aibă cel puțin {min} caractere.',
      errorTokenInvalid:
        'Acest link de resetare este invalid sau a expirat. Solicită un link nou.',
      goToApp: 'Continuă către aplicație',
    },
    team: {
      userAdmin: {
        edit: 'Editează',
        archive: 'Arhivează',
        archiveConfirm:
          'Sigur dorești să arhivezi contul lui {name}? Datele istorice (semnături pe fișe, examinări) rămân intacte, dar contul va fi dezactivat.',
        dialogTitle: 'Editează cont utilizator',
        dialogDescription: 'Modifică rolurile și statusul contului lui {name}.',
        fieldRoles: 'Roluri',
        fieldRolesHelp:
          'Cel puțin un rol este obligatoriu. Asistenții pot face muncă de recepție și introducere date; medicii și administratorii pot semna fișe.',
        fieldIsActive: 'Cont activ',
        fieldIsActiveHelp:
          'Conturile inactive nu se pot autentifica. Util pentru personal aflat temporar în concediu.',
        fieldProfessionalTitle: 'Titlu profesional (opțional)',
        submit: 'Salvează modificările',
        saving: 'Se salvează…',
        archiving: 'Se arhivează…',
        successUpdated: 'Contul a fost actualizat.',
        successArchived: 'Contul a fost arhivat.',
        errorMessage: 'A apărut o eroare. Încearcă din nou.',
        errorLastAdmin:
          'Această acțiune ar lăsa cabinetul fără administrator activ. Promovează alt utilizator la rol de administrator înainte.',
      },
    },
  },
  en: {
    login: {
      forgotPasswordLink: 'Forgot your password?',
    },
    forgotPassword: {
      title: 'Password recovery',
      subtitle:
        'Enter your email address and we will send you a link to reset your password.',
      submitButton: 'Send link',
      submitting: 'Sending…',
      successMessage:
        "If an account exists for this address, you'll receive an email with instructions in a few minutes. Check your spam folder too.",
      errorMessage: 'Something went wrong. Please try again.',
      backToLogin: 'Back to login',
    },
    resetPassword: {
      title: 'Set a new password',
      subtitle: 'Enter a new password for your account.',
      passwordLabel: 'New password',
      confirmLabel: 'Confirm password',
      submitButton: 'Save password',
      submitting: 'Saving…',
      successMessage:
        'Your password has been updated. You can now sign in with the new password.',
      errorMessage: 'Something went wrong. Please try again.',
      errorMismatch: "Passwords don't match.",
      errorTooShort: 'Password must be at least {min} characters.',
      errorTokenInvalid:
        'This reset link is invalid or has expired. Please request a new one.',
      goToApp: 'Continue to app',
    },
    team: {
      userAdmin: {
        edit: 'Edit',
        archive: 'Archive',
        archiveConfirm:
          'Archive {name}\'s account? Historical data (fișa signatures, examinations) remains intact, but the account will be deactivated.',
        dialogTitle: 'Edit user account',
        dialogDescription: "Modify {name}'s roles and account status.",
        fieldRoles: 'Roles',
        fieldRolesHelp:
          'At least one role is required. Assistants can do reception and data entry; practitioners and admins can sign fișa.',
        fieldIsActive: 'Account active',
        fieldIsActiveHelp:
          "Inactive accounts can't sign in. Useful for staff temporarily on leave.",
        fieldProfessionalTitle: 'Professional title (optional)',
        submit: 'Save changes',
        saving: 'Saving…',
        archiving: 'Archiving…',
        successUpdated: 'Account updated.',
        successArchived: 'Account archived.',
        errorMessage: 'Something went wrong. Please try again.',
        errorLastAdmin:
          'This would leave the cabinet without an active administrator. Promote another user to admin first.',
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
  console.log(`  ✓ Wrote ${filePath} — +${totalAdded - before} added.`)
}

console.log(
  `\nDone. Added ${totalAdded} new keys total. Kept ${totalKept} existing keys untouched.`
)

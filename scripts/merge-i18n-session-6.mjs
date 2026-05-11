#!/usr/bin/env node
/**
 * Buzomed session 6 — merge new i18n keys into messages/ro.json and en.json.
 *
 * Adds the `examinations.*` namespace and a handful of new keys to
 * existing namespaces (`nav.examinations`, `employees.lastExamination`,
 * `employees.newExaminationButton`, `employees.examinationsSectionTitle`,
 * `employees.noExaminations`, `workplaces.recentExaminationsTitle`,
 * `workplaces.noExaminations`).
 *
 * Idempotent: skips keys that already exist (keeps your edits), only
 * adds missing ones. Prints a summary of what changed.
 *
 * Usage:
 *   node scripts/merge-i18n-session-6.mjs
 *
 * The script edits files in place. Commit before running if you want
 * a clean diff.
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

// ─── New keys to add ────────────────────────────────────────────────

const additions = {
  ro: {
    nav: {
      examinations: 'Examinări',
    },
    employees: {
      lastExamination: 'Ultima examinare',
      newExaminationButton: 'Examinare nouă',
      examinationsSectionTitle: 'Examinări recente',
      noExaminations: 'Niciun examen înregistrat pentru acest angajat.',
    },
    workplaces: {
      recentExaminationsTitle: 'Examinări recente la acest loc de muncă',
      noExaminations: 'Niciun examen efectuat la acest loc de muncă.',
    },
    examinations: {
      title: 'Examinări medicale',
      subtitle: 'Gestionează examinările medicale și fișele de aptitudine.',
      newButton: 'Examinare nouă',
      backToList: 'Înapoi la examinări',
      empty: 'Nu există încă nicio examinare. Programează prima examinare pentru un angajat cu loc de muncă alocat.',
      tabs: {
        all: 'Toate',
        scheduled: 'Programate',
        in_progress: 'În curs',
        completed: 'Finalizate',
      },
      status: {
        scheduled: 'Programată',
        in_progress: 'În curs',
        completed: 'Finalizată',
        cancelled: 'Anulată',
        no_show: 'Neprezentare',
      },
      requestSource: {
        none: '—',
        employer_request: 'Solicitarea angajatorului',
        periodic_due: 'Periodic (la scadență)',
        employee_request: 'Solicitarea angajatului',
        legal_obligation: 'Obligație legală',
        other: 'Altă cauză',
      },
      metaSection: 'Detalii examinare',
      signedBadge: 'Semnată',
      scheduledFor: 'Programată pentru',
      signedOn: 'Semnată la',
      viewFisa: 'Vizualizează fișa',
      newPage: {
        title: 'Programează o examinare nouă',
        subtitle: 'Selectează angajatul, tipul examinării și medicul examinator.',
        noEligibleEmployees:
          'Niciun angajat nu este eligibil pentru o examinare nouă.',
        noEligibleEmployeesHelp:
          'Angajații trebuie să fie activi (neînchiși) și alocați la un loc de muncă activ.',
        noExaminationTypes:
          'Nu există tipuri de examinare configurate. Rulează seed-ul examination-types.',
        noPractitioners:
          'Niciun medic activ în acest cabinet. Adaugă un utilizator cu rol practitioner.',
      },
      form: {
        sectionWhoWhat: 'Cine și ce',
        sectionContext: 'Context',
        sectionAnamnesis: 'Anamneză',
        sectionVitalSigns: 'Semne vitale',
        sectionVision: 'Examen vedere',
        sectionHearing: 'Examen auz',
        sectionLung: 'Spirometrie',
        sectionAdditional: 'Investigații suplimentare',
        sectionFindings: 'Concluzii clinice',
        sectionVerdict: 'Verdict de aptitudine',
        fieldEmployee: 'Angajat',
        fieldEmployeePlaceholder: 'Selectează angajatul…',
        fieldExaminationType: 'Tipul examinării',
        fieldExaminationTypePlaceholder: 'Selectează tipul…',
        fieldPractitioner: 'Medic examinator',
        fieldScheduledAt: 'Programată la',
        fieldScheduledAtHelp:
          'Opțional. Lasă gol pentru a o crea „acum”.',
        fieldRequestSource: 'Sursa solicitării',
        fieldReferringDocument: 'Nr. document trimitere',
        fieldNotes: 'Note interne (nu apar pe fișă)',
        currentWorkplace: 'Loc de muncă curent',
        submitCreate: 'Creează examinarea',
        submitting: 'Se creează…',
        required: 'Câmp obligatoriu',
        errorMessage: 'A apărut o eroare. Încearcă din nou.',
        // Anamnesis sub-fields
        fieldGeneralHistory: 'Istoric general',
        fieldChronicConditions: 'Boli cronice',
        fieldMedications: 'Medicație curentă',
        fieldAllergies: 'Alergii',
        fieldFamilyHistory: 'Antecedente familiale',
        fieldOccupationalHistory: 'Antecedente profesionale',
        fieldAdditionalNotes: 'Note suplimentare',
        // Vital signs
        fieldHeight: 'Înălțime (cm)',
        fieldWeight: 'Greutate (kg)',
        fieldBmi: 'IMC (calculat)',
        fieldBpSystolic: 'TA sistolică (mmHg)',
        fieldBpDiastolic: 'TA diastolică (mmHg)',
        fieldPulse: 'Puls (bpm)',
        // Vision
        fieldVisionLeft: 'Acuitate vizuală OS (stâng)',
        fieldVisionRight: 'Acuitate vizuală OD (drept)',
        fieldVisionWithCorrection: 'Cu corecție optică',
        fieldVisionColor: 'Simț cromatic',
        // Hearing
        fieldHearingLeft: 'Auz urechea stângă',
        fieldHearingRight: 'Auz urechea dreaptă',
        // Lung
        fieldLungFev1: 'FEV1 (L)',
        fieldLungFvc: 'FVC (L)',
        fieldLungRatio: 'FEV1/FVC',
        // Additional
        fieldAdditionalLab: 'Analize de laborator',
        fieldAdditionalImaging: 'Investigații imagistice',
        fieldAdditionalOther: 'Alte investigații',
        // Findings + verdict
        fieldClinicalFindings: 'Constatări la examenul clinic',
        fieldDiagnoses: 'Diagnostice',
        fieldDiagnosesHelp:
          'Câte un diagnostic pe linie. Va deveni listă structurată după salvare.',
        fieldRecommendations: 'Recomandări',
        fieldVerdict: 'Verdict',
        fieldVerdictConditions: 'Condiții / mențiuni',
        fieldInaptTemporarUntil: 'Inapt temporar până la',
        fieldNextDueDate: 'Următoarea examinare',
        fieldNextDueDateHelp:
          'Pre-completat la {months} luni de la semnare. Poți modifica.',
        verdict: {
          apt: 'Apt',
          apt_conditionat: 'Apt condiționat',
          inapt_temporar: 'Inapt temporar',
          inapt: 'Inapt',
        },
        saveButton: 'Salvează',
        saving: 'Se salvează…',
        savedToast: '✓ Salvat',
        signedNotice:
          'Această examinare a fost semnată și este blocată. Pentru corecții, anulează și creează una nouă.',
      },
      actions: {
        start: 'Începe examinarea',
        starting: 'Se începe…',
        cancel: 'Anulează',
        cancelConfirm: 'Sigur dorești să anulezi această examinare?',
        noShow: 'Marchează neprezentare',
        noShowConfirm: 'Marchezi această examinare ca neprezentare?',
        sign: 'Semnează',
        signing: 'Se semnează…',
        signConfirm:
          'După semnare, examinarea devine definitivă și nu mai poate fi modificată. Continui?',
        signRequirementsNotMet:
          'Setează verdictul înainte de a semna.',
      },
      fisa: {
        title: 'Fișă de aptitudine în muncă',
        subtitle: 'Document medical conform HG 355/2007',
        numberLabel: 'Nr.',
        dateLabel: 'Data',
        workerName: 'Numele lucrătorului',
        workerBirthdate: 'Data nașterii',
        workerIdDocument: 'Document de identitate',
        employer: 'Angajator',
        workplace: 'Loc de muncă',
        examinationType: 'Tipul examinării',
        legalBasis: 'Baza legală',
        verdictHeader: 'Concluzie medicală',
        conditions: 'Condiții',
        inaptUntil: 'Inapt temporar până la',
        nextDue: 'Următoarea examinare',
        recommendations: 'Recomandări',
        parafa: 'Parafa',
        signatureLabel: 'Semnătura și parafa medicului',
        backToExamination: 'Înapoi la examinare',
        printButton: 'Tipărește',
        draftBanner:
          'Aceasta este o previzualizare. Fișa este validă doar după semnare.',
      },
    },
  },
  en: {
    nav: {
      examinations: 'Examinations',
    },
    employees: {
      lastExamination: 'Last examination',
      newExaminationButton: 'New examination',
      examinationsSectionTitle: 'Recent examinations',
      noExaminations: 'No examinations recorded for this employee yet.',
    },
    workplaces: {
      recentExaminationsTitle: 'Recent examinations at this workplace',
      noExaminations: 'No examinations conducted at this workplace.',
    },
    examinations: {
      title: 'Medical examinations',
      subtitle: 'Manage medical examinations and fitness-for-work certificates.',
      newButton: 'New examination',
      backToList: 'Back to examinations',
      empty:
        'No examinations yet. Schedule the first one for an employee with a current workplace.',
      tabs: {
        all: 'All',
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        completed: 'Completed',
      },
      status: {
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
        no_show: 'No-show',
      },
      requestSource: {
        none: '—',
        employer_request: 'Employer request',
        periodic_due: 'Periodic (due)',
        employee_request: 'Employee request',
        legal_obligation: 'Legal obligation',
        other: 'Other',
      },
      metaSection: 'Examination details',
      signedBadge: 'Signed',
      scheduledFor: 'Scheduled for',
      signedOn: 'Signed on',
      viewFisa: 'View certificate',
      newPage: {
        title: 'Schedule a new examination',
        subtitle: 'Select the employee, the examination type, and the practitioner.',
        noEligibleEmployees:
          'No employees are eligible for a new examination.',
        noEligibleEmployeesHelp:
          'Employees must be active (not archived) and assigned to an active workplace.',
        noExaminationTypes:
          'No examination types configured. Run the examination-types seed.',
        noPractitioners:
          'No active practitioners in this cabinet. Add a user with the practitioner role.',
      },
      form: {
        sectionWhoWhat: 'Who & what',
        sectionContext: 'Context',
        sectionAnamnesis: 'Medical history',
        sectionVitalSigns: 'Vital signs',
        sectionVision: 'Vision test',
        sectionHearing: 'Hearing test',
        sectionLung: 'Spirometry',
        sectionAdditional: 'Additional tests',
        sectionFindings: 'Clinical findings',
        sectionVerdict: 'Fitness verdict',
        fieldEmployee: 'Employee',
        fieldEmployeePlaceholder: 'Select employee…',
        fieldExaminationType: 'Examination type',
        fieldExaminationTypePlaceholder: 'Select type…',
        fieldPractitioner: 'Practitioner',
        fieldScheduledAt: 'Scheduled at',
        fieldScheduledAtHelp:
          'Optional. Leave empty to create one "now".',
        fieldRequestSource: 'Request source',
        fieldReferringDocument: 'Referring document #',
        fieldNotes: 'Internal notes (not on certificate)',
        currentWorkplace: 'Current workplace',
        submitCreate: 'Create examination',
        submitting: 'Creating…',
        required: 'Required',
        errorMessage: 'Something went wrong. Please try again.',
        fieldGeneralHistory: 'General history',
        fieldChronicConditions: 'Chronic conditions',
        fieldMedications: 'Current medications',
        fieldAllergies: 'Allergies',
        fieldFamilyHistory: 'Family history',
        fieldOccupationalHistory: 'Occupational history',
        fieldAdditionalNotes: 'Additional notes',
        fieldHeight: 'Height (cm)',
        fieldWeight: 'Weight (kg)',
        fieldBmi: 'BMI (computed)',
        fieldBpSystolic: 'BP systolic (mmHg)',
        fieldBpDiastolic: 'BP diastolic (mmHg)',
        fieldPulse: 'Pulse (bpm)',
        fieldVisionLeft: 'Left eye acuity',
        fieldVisionRight: 'Right eye acuity',
        fieldVisionWithCorrection: 'With optical correction',
        fieldVisionColor: 'Color perception',
        fieldHearingLeft: 'Left ear',
        fieldHearingRight: 'Right ear',
        fieldLungFev1: 'FEV1 (L)',
        fieldLungFvc: 'FVC (L)',
        fieldLungRatio: 'FEV1/FVC',
        fieldAdditionalLab: 'Laboratory tests',
        fieldAdditionalImaging: 'Imaging',
        fieldAdditionalOther: 'Other investigations',
        fieldClinicalFindings: 'Clinical findings',
        fieldDiagnoses: 'Diagnoses',
        fieldDiagnosesHelp:
          'One diagnosis per line. Stored as a structured list on save.',
        fieldRecommendations: 'Recommendations',
        fieldVerdict: 'Verdict',
        fieldVerdictConditions: 'Conditions / remarks',
        fieldInaptTemporarUntil: 'Temporarily unfit until',
        fieldNextDueDate: 'Next examination',
        fieldNextDueDateHelp:
          'Pre-filled to {months} months after signing. You can override.',
        verdict: {
          apt: 'Fit',
          apt_conditionat: 'Fit with conditions',
          inapt_temporar: 'Temporarily unfit',
          inapt: 'Unfit',
        },
        saveButton: 'Save',
        saving: 'Saving…',
        savedToast: '✓ Saved',
        signedNotice:
          'This examination is signed and locked. Cancel and create a new one for corrections.',
      },
      actions: {
        start: 'Start examination',
        starting: 'Starting…',
        cancel: 'Cancel',
        cancelConfirm: 'Cancel this examination?',
        noShow: 'Mark as no-show',
        noShowConfirm: 'Mark this examination as a no-show?',
        sign: 'Sign',
        signing: 'Signing…',
        signConfirm:
          'Once signed, this examination becomes final and cannot be edited. Continue?',
        signRequirementsNotMet: 'Set the verdict before signing.',
      },
      fisa: {
        title: 'Fitness-for-work certificate',
        subtitle: 'Medical document per HG 355/2007',
        numberLabel: 'No.',
        dateLabel: 'Date',
        workerName: 'Worker name',
        workerBirthdate: 'Date of birth',
        workerIdDocument: 'ID document',
        employer: 'Employer',
        workplace: 'Workplace',
        examinationType: 'Examination type',
        legalBasis: 'Legal basis',
        verdictHeader: 'Medical conclusion',
        conditions: 'Conditions',
        inaptUntil: 'Temporarily unfit until',
        nextDue: 'Next examination due',
        recommendations: 'Recommendations',
        parafa: 'Stamp code',
        signatureLabel: 'Practitioner signature and stamp',
        backToExamination: 'Back to examination',
        printButton: 'Print',
        draftBanner:
          'This is a preview. The certificate is only valid once signed.',
      },
    },
  },
}

// ─── Merge logic ────────────────────────────────────────────────────

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

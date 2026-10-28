/**
 * Generates the sandbox's static sample PDFs using the REAL PDF code
 * (lib/examinations/pdf-fill + the clinical/dosar field builders), fed with
 * deterministic fixture examinations — no database.
 *
 * Output (committed): public/sandbox/pdfs/
 *   - fisa-aptitudine.pdf   (fișă de aptitudine, periodic all-normal exam)
 *   - examen-periodic.pdf   (examen medical periodic, same exam)
 *   - examen-angajare.pdf   (examen medical la angajare)
 *   - dosar-medical.pdf     (dosar medical, angajare exam)
 *
 * The window.open shim (lib/sandbox/mock-api.ts → resolveStaticPdf) opens the
 * closest of these when a demo user clicks „Vezi foaia" or generates a filled
 * document. Run once and commit:  npx tsx scripts/build-sandbox-pdfs.ts
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildClinicalSheetFields } from '@/lib/examinations/clinical-exam'
import { buildDosarFields } from '@/lib/examinations/dosar-medical'
import { fillExaminationPdf } from '@/lib/examinations/pdf-fill'
import { buildNormalClinicalExam } from '@/lib/sandbox/clinical'
import { buildFixtures } from '@/lib/sandbox/fixtures'
import type { SandboxData, SandboxExamination } from '@/lib/sandbox/types'

function formatRo(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function str(v: unknown): string {
  return v !== null && v !== undefined && v !== '' ? String(v) : ''
}

interface Resolved {
  exam: SandboxExamination
  employeeName: { last: string; first: string }
  jobTitle: string
  companyName: string
  companyAddress: string
  workplaceName: string
  department: string
  cnp: string
  gender: string
  birthDate: Date | null
  phone: string
  address: string
}

function resolve(data: SandboxData, exam: SandboxExamination): Resolved {
  const emp = data.employees.find((e) => e.id === exam.employeeId)!
  const wp = data.workplaces.find((w) => w.id === exam.workplaceId)!
  const co = data.companies.find((c) => c.id === exam.companyId)!
  return {
    exam,
    employeeName: { last: emp.lastName, first: emp.firstName },
    jobTitle: emp.jobTitle ?? '',
    companyName: co.name,
    companyAddress: [co.city, co.county].filter(Boolean).join(', '),
    workplaceName: wp.name,
    department: wp.department ?? '',
    cnp: emp.cnp ?? '',
    gender: emp.gender,
    birthDate: emp.birthDate,
    phone: emp.phone ?? '',
    address: [co.city, co.county].filter(Boolean).join(', '),
  }
}

function fisaAptitudineFields(r: Resolved): Record<string, string | boolean> {
  const e = r.exam
  const examDate = formatRo(e.examinedAt ?? e.completedAt ?? new Date())
  const nextDue = e.nextExaminationDueDate ? formatRo(e.nextExaminationDueDate) : ''
  const verdict = e.verdict ?? ''
  const TYPE_CHECKBOX: Record<string, string> = {
    angajare: 'tip_Angaja',
    control_periodic: 'tip_Examen',
    adaptare: 'tip_Adapta',
    reluare_munca: 'tip_Reluar',
    supraveghere_speciala: 'tip_Suprav',
  }
  const typeCheckField = TYPE_CHECKBOX[e.examinationTypeCode] ?? 'tip_Altele'
  const fields: Record<string, string | boolean> = {}
  for (const suffix of ['_A', '_B']) {
    fields[`societate${suffix}`] = r.companyName
    fields[`adresa${suffix}`] = r.companyAddress
    fields[`nume${suffix}`] = r.employeeName.last
    fields[`prenume${suffix}`] = r.employeeName.first
    fields[`cnp${suffix}`] = r.cnp
    fields[`ocupatia${suffix}`] = r.jobTitle
    fields[`post${suffix}`] = r.workplaceName
    fields[`data${suffix}`] = examDate
    fields[`data_urm${suffix}`] = nextDue
    fields[`recomandari${suffix}`] = e.verdictConditions ?? e.recommendations ?? ''
    fields[`apt${suffix}`] = verdict === 'apt'
    fields[`apt_cond${suffix}`] = verdict === 'apt_conditionat'
    fields[`inapt_temp${suffix}`] = verdict === 'inapt_temporar'
    fields[`inapt${suffix}`] = verdict === 'inapt'
    for (const cb of [
      'tip_Angaja',
      'tip_Examen',
      'tip_Adapta',
      'tip_Reluar',
      'tip_Suprav',
      'tip_Altele',
    ]) {
      fields[`${cb}${suffix}`] = false
    }
    fields[`${typeCheckField}${suffix}`] = true
  }
  return fields
}

function clinicalStaticFields(r: Resolved, prefix: string): Record<string, string | boolean> {
  const e = r.exam
  const vs = e.vitalSigns
  const examDate = formatRo(e.examinedAt ?? e.completedAt ?? new Date())
  const nextDue = e.nextExaminationDueDate ? formatRo(e.nextExaminationDueDate) : ''
  const verdict = e.verdict ?? ''
  const p = (k: string) => `${prefix}${k}`
  const fields: Record<string, string | boolean> = {
    [p('nume_angajat')]: `${r.employeeName.last} ${r.employeeName.first}`,
    [p('nr_dosar')]: e.examinationNumber,
    [p('data_top')]: examDate,
    [p('inaltime')]: str(vs.height),
    [p('greutate')]: str(vs.weight),
    [p('imc')]: str(vs.bmi),
    [p('ta')]: vs.bpSystolic ? `${vs.bpSystolic}/${vs.bpDiastolic}` : '',
    [p('av')]: str(vs.pulse),
    [p('spec_text')]: e.clinicalFindings ?? '',
    [p('recomandari')]: e.recommendations ?? '',
    [p('aviz_functie')]: r.jobTitle,
    [p('data_exam')]: examDate,
    [p('data_urmator')]: nextDue,
    [p('apt')]: verdict === 'apt',
    [p('apt_cond')]: verdict === 'apt_conditionat',
    [p('inapt_temp')]: verdict === 'inapt_temporar',
    [p('inapt')]: verdict === 'inapt',
  }
  const def = buildClinicalSheetFields({
    clinicalExam: e.clinicalExam,
    visionTest: e.visionTest,
    hearingTest: e.hearingTest,
    anamnesis: e.anamnesis,
    additionalTests: e.additionalTests,
    vitalSigns: e.vitalSigns,
  })
  for (const [k, v] of Object.entries(def)) fields[`${prefix}${k}`] = v
  return fields
}

function dosarFields(r: Resolved): Record<string, string | boolean> {
  const e = r.exam
  const birth = r.birthDate
  const when = e.examinedAt ?? e.completedAt ?? new Date()
  const varsta =
    birth != null
      ? String(
          when.getFullYear() -
            birth.getFullYear() -
            (when < new Date(when.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
        )
      : ''
  return {
    sex: r.gender,
    ...buildDosarFields({
      anamnesis: e.anamnesis,
      companyName: r.companyName,
      workplaceName: r.workplaceName,
      department: r.department,
      companyAddress: r.companyAddress,
      lastName: r.employeeName.last,
      firstName: r.employeeName.first,
      varsta,
      dataNasterii: birth ? formatRo(birth) : '',
      cnp: r.cnp,
      employeeAddress: r.address,
      phone: r.phone,
      jobTitle: r.jobTitle,
      gender: r.gender || null,
      disabilityDegree: null,
      medicCurantName: null,
      familyHistory: '',
      allergies: '',
    }),
  }
}

async function main() {
  const data = buildFixtures(new Date())

  // Pick a completed, signed periodic (all-normal) exam and an angajare exam.
  const periodic = data.examinations.find(
    (e) =>
      e.examinationTypeCode === 'control_periodic' &&
      e.status === 'completed' &&
      e.verdict === 'apt' &&
      e.signedAt
  )
  const angajare = data.examinations.find(
    (e) => e.examinationTypeCode === 'angajare' && e.status === 'completed' && e.signedAt
  )
  if (!periodic) throw new Error('No completed periodic exam found in fixtures')

  // Ensure the periodic exam has a full normal clinical sheet for the sample.
  periodic.clinicalExam = buildNormalClinicalExam()
  periodic.additionalTests = { ordered: ['oftalmo', 'ekg', 'glicemie', 'hemo'] }

  const rPeriodic = resolve(data, periodic)
  const rAngajare = angajare ? resolve(data, angajare) : rPeriodic

  const outDir = path.join(process.cwd(), 'public', 'sandbox', 'pdfs')
  await mkdir(outDir, { recursive: true })

  const jobs: Array<{ file: string; template: string; fields: Record<string, string | boolean> }> =
    [
      {
        file: 'fisa-aptitudine.pdf',
        template: 'Fisa-Aptitudine-BLANK.pdf',
        fields: fisaAptitudineFields(rPeriodic),
      },
      {
        file: 'examen-periodic.pdf',
        template: 'Examen-medical-periodic-BLANK.pdf',
        fields: clinicalStaticFields(rPeriodic, 'p_'),
      },
      {
        file: 'examen-angajare.pdf',
        template: 'Examen-medical-angajare-BLANK.pdf',
        fields: clinicalStaticFields(rAngajare, ''),
      },
      {
        file: 'dosar-medical.pdf',
        template: 'Dosar-Medical-BLANK.pdf',
        fields: dosarFields(rAngajare),
      },
    ]

  for (const job of jobs) {
    const bytes = await fillExaminationPdf(job.template, job.fields)
    await writeFile(path.join(outDir, job.file), bytes)
    console.log(`✓ wrote public/sandbox/pdfs/${job.file} (${bytes.length} bytes)`)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

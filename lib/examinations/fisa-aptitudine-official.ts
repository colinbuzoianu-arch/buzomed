import type { Prisma } from '@prisma/client'
import { fillExaminationPdf } from '@/lib/examinations/pdf-fill'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'

/**
 * The OFFICIAL fișa de aptitudine — the government AcroForm template
 * (`Fisa-Aptitudine-BLANK.pdf`) filled with the ocupația / post / verdict
 * fields. This is the form the cabinet prints at the end of an examination
 * (via /api/examinations/[id]/documents/fisa_aptitudine) and the one the
 * employer must receive by law.
 *
 * Extracted here so the cabinet document route AND the HR-portal download
 * produce the exact same official PDF. (Note: the react-pdf render in
 * fisa-pdf-data.ts / archive-fisa is a separate, Buzomed-styled copy; the HR
 * portal must NOT use it — it is not the official form.)
 */

/** Template file name — must match document-templates.ts FISA_APTITUDINE. */
export const FISA_APTITUDINE_TEMPLATE = 'Fisa-Aptitudine-BLANK.pdf'

/** The fields the official fișă needs — ocupația/funcția and post included. */
export const FISA_OFFICIAL_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idDocumentType: true,
      idDocumentNumber: true,
      cnpEncrypted: true,
      jobTitle: true,
    },
  },
  workplace: { include: { company: true } },
  examinationType: { select: { nameRo: true, code: true } },
} satisfies Prisma.ExaminationInclude

export type ExaminationForOfficialFisa = Prisma.ExaminationGetPayload<{
  include: typeof FISA_OFFICIAL_INCLUDE
}>

/** Long-form Romanian date, exactly as the official form prints it. */
function formatDateRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/**
 * Builds the AcroForm field map for the official fișa de aptitudine. The CNP is
 * passed in (decrypting needs the acting user's permission, which this pure
 * builder can't see). Logic mirrors the `fisa_aptitudine` branch of the cabinet
 * documents route 1:1 — keep the two in step.
 */
export function buildFisaAptitudineFields(
  examination: ExaminationForOfficialFisa,
  cnpValue: string
): Record<string, string | boolean> {
  const TYPE_CHECKBOX: Record<string, string> = {
    angajare: 'tip_Angaja',
    control_periodic: 'tip_Examen',
    adaptare: 'tip_Adapta',
    reluare_munca: 'tip_Reluar',
    supraveghere_speciala: 'tip_Suprav',
  }
  const typeCheckField = TYPE_CHECKBOX[examination.examinationType.code] ?? 'tip_Altele'

  const examDate = formatDateRo(resolveExaminationDate(examination))
  const nextDueDate = examination.nextExaminationDueDate
    ? formatDateRo(examination.nextExaminationDueDate)
    : ''
  const verdict = examination.verdict ?? ''
  const companyAddr = [
    examination.workplace.company.addressLine1,
    examination.workplace.company.city,
  ]
    .filter(Boolean)
    .join(', ')

  const fields: Record<string, string | boolean> = {}
  for (const suffix of ['_A', '_B']) {
    fields[`societate${suffix}`] = examination.workplace.company.name
    fields[`adresa${suffix}`] = companyAddr
    fields[`nume${suffix}`] = examination.employee.lastName
    fields[`prenume${suffix}`] = examination.employee.firstName
    fields[`cnp${suffix}`] = cnpValue
    fields[`ocupatia${suffix}`] = examination.employee.jobTitle ?? ''
    fields[`post${suffix}`] = examination.workplace.name
    fields[`data${suffix}`] = examDate
    fields[`data_urm${suffix}`] = nextDueDate
    fields[`recomandari${suffix}`] =
      examination.verdictConditions ?? examination.recommendations ?? ''
    fields[`apt${suffix}`] = verdict === 'apt'
    fields[`apt_cond${suffix}`] = verdict === 'apt_conditionat'
    fields[`inapt_temp${suffix}`] = verdict === 'inapt_temporar'
    fields[`inapt${suffix}`] = verdict === 'inapt'
    for (const cb of ['tip_Angaja', 'tip_Examen', 'tip_Adapta', 'tip_Reluar', 'tip_Suprav', 'tip_Altele']) {
      fields[`${cb}${suffix}`] = false
    }
    fields[`${typeCheckField}${suffix}`] = true
  }
  return fields
}

/** Renders the official fișă AcroForm PDF to a buffer. */
export async function renderOfficialFisaAptitudine(
  examination: ExaminationForOfficialFisa,
  cnpValue: string
): Promise<Uint8Array> {
  const fields = buildFisaAptitudineFields(examination, cnpValue)
  return fillExaminationPdf(FISA_APTITUDINE_TEMPLATE, fields)
}

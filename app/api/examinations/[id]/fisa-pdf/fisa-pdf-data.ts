import type { Prisma } from '@prisma/client'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import type { FisaPdfProps } from './fisa-pdf-document'

/**
 * Shared data layer for the fișa de aptitudine PDF.
 *
 * Two routes render the same document: `fisa-pdf` streams it to the browser
 * on demand, and `archive-fisa` renders it to store a copy in Documents.
 * Both previously carried their own copy of the Prisma `include` and of the
 * ~60-line props payload, with a comment in archive-fisa noting it "mirrors
 * fisa-pdf/route.ts exactly".
 *
 * That duplication had already started to cost: adding the withdrawal fields
 * meant editing both, and missing one would have left the archived copy of a
 * withdrawn certificate rendering as valid — the exact failure the
 * withdrawal feature exists to prevent. The shape of the bug is the point:
 * a divergence here is silent, and what it produces is an official document
 * that says the wrong thing.
 *
 * So the query shape and the payload now live in one place. A new field on
 * the fișă is added once.
 */

/**
 * Everything the PDF needs. Keep in sync with `buildFisaPdfData` below —
 * the compiler enforces this, since the builder's parameter type is derived
 * from this include.
 */
export const FISA_PDF_INCLUDE = {
  tenant: true,
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      gender: true,
      idDocumentType: true,
    },
  },
  workplace: {
    include: { company: true },
  },
  examinationType: {
    select: { nameRo: true, code: true },
  },
  practitioner: {
    select: {
      firstName: true,
      lastName: true,
      professionalTitle: true,
      professionalCode: true,
      stampImageUrl: true,
      signatureImageUrl: true,
    },
  },
  location: {
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      county: true,
    },
  },
  revokedBy: {
    select: {
      firstName: true,
      lastName: true,
      professionalTitle: true,
    },
  },
  supersededBy: {
    select: { examinationNumber: true },
  },
} satisfies Prisma.ExaminationInclude

/**
 * An examination loaded with exactly `FISA_PDF_INCLUDE`. Derived rather than
 * hand-written so the two cannot drift apart.
 */
export type ExaminationForFisaPdf = Prisma.ExaminationGetPayload<{
  include: typeof FISA_PDF_INCLUDE
}>

/** Long-form Romanian date, as the official form uses. */
export function formatDateRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * Builds the PDF component's props from a loaded examination.
 *
 * Returns plain serializable values only — no Prisma objects reach the
 * renderer.
 *
 * `isDraft` is derived from `signedAt` rather than passed in. archive-fisa
 * used to hardcode `false`, which was equivalent only because that route
 * refuses unsigned examinations before it gets here; deriving it removes the
 * chance of the two answers disagreeing if that precondition ever changes.
 */
export function buildFisaPdfData(examination: ExaminationForFisaPdf): FisaPdfProps {
  const vs = (examination.vitalSigns ?? {}) as Record<string, unknown>

  return {
    cabinetName: examination.tenant.legalName ?? examination.tenant.name,
    logoUrl: examination.tenant.logoUrl ?? null,
    stampUrl: examination.practitioner?.stampImageUrl ?? null,
    signatureUrl: examination.practitioner?.signatureImageUrl ?? null,
    cabinetAddress: [
      examination.location.addressLine1,
      examination.location.addressLine2,
      examination.location.city,
      examination.location.county,
    ]
      .filter(Boolean)
      .join(', '),

    examinationNumber: examination.examinationNumber,
    // The consultation date, which may legitimately precede the signing
    // date. resolveExaminationDate keeps the completedAt → createdAt
    // fallback for records predating the examinedAt column, so an
    // already-issued document reprints identically.
    examinationDate: formatDateRo(resolveExaminationDate(examination)),
    signedAt: examination.signedAt ? formatDateRo(examination.signedAt) : null,

    // Worker
    workerName: `${examination.employee.lastName} ${examination.employee.firstName}`,
    workerBirthDate: examination.employee.birthDate
      ? formatDateRo(examination.employee.birthDate)
      : '—',
    workerGender: examination.employee.gender ?? '—',

    // Company / workplace
    companyName: examination.workplace.company.name,
    companyCui: examination.workplace.company.cui ?? '—',
    workplaceName: examination.workplace.name,
    workplaceDepartment: examination.workplace.department ?? null,

    // Exam type
    examinationTypeName: examination.examinationType.nameRo,

    // Clinical
    verdict: examination.verdict ?? null,
    verdictConditions: examination.verdictConditions ?? null,
    nextExaminationDueDate: examination.nextExaminationDueDate
      ? formatDateRo(examination.nextExaminationDueDate)
      : '—',
    inaptUntil: examination.inaptTemporarUntil
      ? formatDateRo(examination.inaptTemporarUntil)
      : null,
    clinicalFindings: examination.clinicalFindings ?? null,
    vitalSigns: {
      height: (vs.height as number) ?? null,
      weight: (vs.weight as number) ?? null,
      bmi: (vs.bmi as number) ?? null,
      bpSystolic: (vs.bpSystolic as number) ?? null,
      bpDiastolic: (vs.bpDiastolic as number) ?? null,
      pulse: (vs.pulse as number) ?? null,
    },

    // Practitioner
    practitionerName: examination.practitioner
      ? `${examination.practitioner.lastName} ${examination.practitioner.firstName}`
      : '—',
    practitionerTitle: examination.practitioner?.professionalTitle ?? null,
    practitionerCode: examination.practitioner?.professionalCode ?? null,

    isDraft: examination.signedAt === null,

    // Withdrawal
    isRevoked: examination.revokedAt !== null,
    revokedAt: examination.revokedAt ? formatDateRo(examination.revokedAt) : null,
    revokedByName: examination.revokedBy
      ? `${examination.revokedBy.professionalTitle ?? ''} ${examination.revokedBy.lastName} ${examination.revokedBy.firstName}`.trim()
      : null,
    revocationReason: examination.revocationReason ?? null,
    supersededByNumber: examination.supersededBy?.examinationNumber ?? null,
  }
}

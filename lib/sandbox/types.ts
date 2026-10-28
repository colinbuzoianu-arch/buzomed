/**
 * Plain, serializable domain types for the sandbox dataset.
 *
 * These deliberately mirror the subset of Prisma columns the reused UI
 * components actually read — they are NOT the Prisma models (the sandbox
 * must never import @prisma/client runtime or @/lib/prisma). Dates are real
 * Date objects; they cross the server→client boundary fine and the reused
 * components already accept `Date | string`.
 */

export type ExaminationStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

export type ExaminationVerdict = 'apt' | 'apt_conditionat' | 'inapt_temporar' | 'inapt'

export type RecallStatus = 'pending' | 'scheduled' | 'completed' | 'overdue' | 'cancelled'

export type ExaminationTypeCode =
  | 'angajare'
  | 'control_periodic'
  | 'adaptare'
  | 'reluare_munca'
  | 'supraveghere_speciala'

export interface SandboxExaminationType {
  id: string
  code: ExaminationTypeCode
  nameRo: string
  nameEn: string
  defaultValidityMonths: number
  sortOrder: number
}

/** A hazard present at a workplace — drives reports + Iris recommendations. */
export interface SandboxHazard {
  /** stable key, e.g. 'zgomot' */
  key: string
  /** Romanian label, e.g. 'Zgomot profesional' */
  label: string
}

export interface SandboxCompany {
  id: string
  name: string
  cui: string
  city: string
  county: string
  caenCode: string
  /** short industry label for the demo, e.g. 'Construcții metalice' */
  industry: string
  isActive: boolean
  createdAt: Date
}

export interface SandboxWorkplace {
  id: string
  companyId: string
  name: string
  department: string | null
  hazards: SandboxHazard[]
  /** Real RiskProfile-shaped JSON derived from `hazards`, consumed by the
   *  reused risk-profile components and reports. */
  riskProfile: Record<string, unknown>
  examinationIntervalMonths: number
  isActive: boolean
}

export interface SandboxEmployee {
  id: string
  companyId: string | null
  /** current workplace assignment, or null for the "fără loc de muncă" cases */
  workplaceId: string | null
  firstName: string
  lastName: string
  jobTitle: string | null
  /** plain fake CNP string; never shown in lists, only masked in the header */
  cnp: string | null
  birthDate: Date | null
  gender: 'M' | 'F'
  phone: string | null
  email: string | null
  archivedAt: Date | null
  createdAt: Date
}

export interface SandboxExamination {
  id: string
  employeeId: string
  companyId: string
  workplaceId: string
  examinationTypeId: string
  examinationTypeCode: ExaminationTypeCode
  examinationNumber: string
  examinationYear: number
  examinationSequence: number

  status: ExaminationStatus
  scheduledAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  examinedAt: Date | null
  signedAt: Date | null
  createdAt: Date

  verdict: ExaminationVerdict | null
  verdictConditions: string | null
  inaptTemporarUntil: Date | null
  nextExaminationDueDate: Date | null

  /** stepper step the exam is parked on (1-based); null unless in_progress */
  currentStep: number | null

  /** Clinical JSON buckets — shapes match the real Examination columns the
   *  reused ExaminationStepper and PDF code read. */
  anamnesis: Record<string, unknown>
  vitalSigns: Record<string, unknown>
  visionTest: Record<string, unknown>
  hearingTest: Record<string, unknown>
  lungFunction: Record<string, unknown>
  additionalTests: Record<string, unknown>
  maternityRisk: Record<string, unknown>
  clinicalExam: Record<string, unknown>
  diagnoses: string[]
  clinicalFindings: string
  recommendations: string
  notes: string

  /** revocation / replacement chain (one revoked fișă in the fixtures) */
  revokedAt: Date | null
  revocationReason: string | null
  supersededByExaminationId: string | null
}

export interface SandboxRecall {
  id: string
  employeeId: string
  companyId: string
  workplaceId: string
  examinationTypeId: string
  examinationTypeCode: ExaminationTypeCode
  dueDate: Date
  status: RecallStatus
  createdFromExaminationId: string | null
}

export interface SandboxPractitioner {
  id: string
  firstName: string
  lastName: string
  displayName: string
}

export interface SandboxData {
  /** the instant "today" was resolved at generation time */
  now: Date
  practitioner: SandboxPractitioner
  cabinetName: string
  examinationTypes: SandboxExaminationType[]
  companies: SandboxCompany[]
  workplaces: SandboxWorkplace[]
  employees: SandboxEmployee[]
  examinations: SandboxExamination[]
  recalls: SandboxRecall[]
  /** id of the in-progress "hero" exam used by the guided tour */
  heroExaminationId: string
}

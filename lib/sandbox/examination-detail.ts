/**
 * Derives everything the reused ExaminationStepper + context card need from a
 * sandbox examination in the store — the same props the real server page
 * builds from Prisma, but computed in the browser from fixtures.
 */

import type {
  ExaminationFormValues,
  Labels,
} from '@/app/(authenticated)/examinations/[id]/examination-stepper'
import type { DosarIdentity } from '@/app/(authenticated)/examinations/[id]/steps/dosar-medical-intake'
import { formatDate } from '@/lib/format-date'
import { getHazardHintKeys, parseRiskProfile } from '@/lib/workplaces/risk-profile'
import { sandboxT as t } from './i18n'
import type {
  SandboxCompany,
  SandboxData,
  SandboxEmployee,
  SandboxExamination,
  SandboxExaminationType,
  SandboxWorkplace,
} from './types'

export interface SandboxExamDetail {
  exam: SandboxExamination
  employee: SandboxEmployee
  workplace: SandboxWorkplace
  company: SandboxCompany
  type: SandboxExaminationType
  examTypeName: string
  practitionerName: string
  priorExam: PriorExamView | null
  isSigned: boolean
  isRevoked: boolean
  isLocked: boolean
  canRevoke: boolean
  revokeCandidates: { id: string; examinationNumber: string }[]
  supersededBy: { id: string; examinationNumber: string } | null
  hazardHintLabels: Record<string, string>
  dosarIdentity: DosarIdentity
  initialValues: ExaminationFormValues
}

export interface PriorExamView {
  examinationNumber: string
  createdAt: Date
  signedAt: Date | null
  verdict: string | null
  verdictConditions: string | null
  vitalSigns: unknown
  clinicalFindings: string | null
  recommendations: string | null
  examinationType: { nameRo: string; nameEn: string | null }
}

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

export function deriveExamDetail(data: SandboxData, id: string): SandboxExamDetail | null {
  const exam = data.examinations.find((e) => e.id === id)
  if (!exam) return null
  const employee = data.employees.find((e) => e.id === exam.employeeId)
  const workplace = data.workplaces.find((w) => w.id === exam.workplaceId)
  const company = data.companies.find((c) => c.id === exam.companyId)
  const type = data.examinationTypes.find((t2) => t2.id === exam.examinationTypeId)
  if (!employee || !workplace || !company || !type) return null

  const isSigned = exam.signedAt !== null
  const isRevoked = exam.revokedAt !== null
  const isLocked = isSigned || exam.status === 'cancelled' || exam.status === 'no_show'

  // Prior examination for the same employee (not cancelled/no_show/this one).
  const prior = data.examinations
    .filter(
      (e) =>
        e.employeeId === exam.employeeId &&
        e.id !== exam.id &&
        e.status !== 'cancelled' &&
        e.status !== 'no_show'
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  const priorType = prior
    ? data.examinationTypes.find((x) => x.id === prior.examinationTypeId)
    : undefined
  const priorExam: PriorExamView | null = prior
    ? {
        examinationNumber: prior.examinationNumber,
        createdAt: prior.createdAt,
        signedAt: prior.signedAt,
        verdict: prior.verdict,
        verdictConditions: prior.verdictConditions,
        vitalSigns: prior.vitalSigns,
        clinicalFindings: prior.clinicalFindings || null,
        recommendations: prior.recommendations || null,
        examinationType: { nameRo: priorType?.nameRo ?? '', nameEn: priorType?.nameEn ?? null },
      }
    : null

  // Hazard hints from the workplace risk profile.
  const rp = parseRiskProfile(workplace.riskProfile)
  const hazardHintLabels: Record<string, string> = {}
  for (const key of getHazardHintKeys(rp)) {
    if (key === 'hearing') hazardHintLabels.hearing = t('examinations.form.hazardHintHearing')
    if (key === 'lung') hazardHintLabels.lung = t('examinations.form.hazardHintLung')
    if (key === 'additional')
      hazardHintLabels.additional = t('examinations.form.hazardHintAdditional')
  }

  // Dosar identity block.
  const birth = employee.birthDate
  let age = ''
  if (birth) {
    const when = exam.examinedAt ?? new Date()
    let a = when.getFullYear() - birth.getFullYear()
    const md = when.getMonth() - birth.getMonth()
    if (md < 0 || (md === 0 && when.getDate() < birth.getDate())) a--
    age = String(a)
  }
  const dosarIdentity: DosarIdentity = {
    unitate: company.name,
    sectia: workplace.department ?? '',
    nume: employee.lastName,
    prenume: employee.firstName,
    dataNasterii: birth ? formatDate(birth, 'medium', 'ro') : '',
    varsta: age,
    sex: employee.gender ?? '',
    adresa: '',
    telefon: employee.phone ?? '',
    ocupatia: employee.jobTitle ?? '',
    cnpPresent: !!employee.cnp,
    disabilityLabel: null,
    employeeEditHref: '/sandbox/employees',
    companyEditHref: '/sandbox/companies',
  }

  const initialValues: ExaminationFormValues = {
    anamnesis: exam.anamnesis,
    vitalSigns: exam.vitalSigns,
    visionTest: exam.visionTest,
    hearingTest: exam.hearingTest,
    lungFunction: exam.lungFunction,
    additionalTests: exam.additionalTests,
    maternityRisk: exam.maternityRisk,
    clinicalExam: exam.clinicalExam,
    diagnoses: exam.diagnoses,
    clinicalFindings: exam.clinicalFindings,
    recommendations: exam.recommendations,
    notes: exam.notes,
    verdict: exam.verdict,
    verdictConditions: exam.verdictConditions ?? '',
    employerRequirementsOnFisa: '',
    inaptTemporarUntil: toDateInput(exam.inaptTemporarUntil),
    nextExaminationDueDate: toDateInput(exam.nextExaminationDueDate),
    examinedAt: exam.examinedAt
      ? toDateInput(exam.examinedAt)
      : isSigned
        ? ''
        : new Date().toISOString().slice(0, 10),
  }

  const supersededBy = exam.supersededByExaminationId
    ? (() => {
        const s = data.examinations.find((e) => e.id === exam.supersededByExaminationId)
        return s ? { id: s.id, examinationNumber: s.examinationNumber } : null
      })()
    : null

  const canRevoke = isSigned && !isRevoked
  const revokeCandidates = canRevoke
    ? data.examinations
        .filter(
          (e) =>
            e.employeeId === exam.employeeId &&
            e.id !== exam.id &&
            e.signedAt !== null &&
            e.revokedAt === null
        )
        .slice(0, 20)
        .map((e) => ({ id: e.id, examinationNumber: e.examinationNumber }))
    : []

  return {
    exam,
    employee,
    workplace,
    company,
    type,
    examTypeName: type.nameRo,
    practitionerName: data.practitioner.displayName,
    priorExam,
    isSigned,
    isRevoked,
    isLocked,
    canRevoke,
    revokeCandidates,
    supersededBy,
    hazardHintLabels,
    dosarIdentity,
    initialValues,
  }
}

/**
 * The stepper's full labels object, built from ro.json. Mirrors the mapping in
 * the real examination detail page.
 */
export function buildStepperLabels(examinationTypeCode: string): Labels {
  return {
    sectionAnamnesis: t('examinations.form.sectionAnamnesis'),
    sectionVitalSigns: t('examinations.form.sectionVitalSigns'),
    sectionVision: t('examinations.form.sectionVision'),
    sectionHearing: t('examinations.form.sectionHearing'),
    sectionLung: t('examinations.form.sectionLung'),
    sectionAdditional: t('examinations.form.sectionAdditional'),
    sectionFindings: t('examinations.form.sectionFindings'),
    sectionVerdict: t('examinations.form.sectionVerdict'),
    fieldGeneralHistory: t('examinations.form.fieldGeneralHistory'),
    fieldChronicConditions: t('examinations.form.fieldChronicConditions'),
    fieldMedications: t('examinations.form.fieldMedications'),
    fieldAllergies: t('examinations.form.fieldAllergies'),
    fieldFamilyHistory: t('examinations.form.fieldFamilyHistory'),
    fieldOccupationalHistory: t('examinations.form.fieldOccupationalHistory'),
    fieldAdditionalNotes: t('examinations.form.fieldAdditionalNotes'),
    fieldHeight: t('examinations.form.fieldHeight'),
    fieldWeight: t('examinations.form.fieldWeight'),
    fieldBmi: t('examinations.form.fieldBmi'),
    fieldBpSystolic: t('examinations.form.fieldBpSystolic'),
    fieldBpDiastolic: t('examinations.form.fieldBpDiastolic'),
    fieldPulse: t('examinations.form.fieldPulse'),
    fieldVisionLeft: t('examinations.form.fieldVisionLeft'),
    fieldVisionRight: t('examinations.form.fieldVisionRight'),
    fieldVisionWithCorrection: t('examinations.form.fieldVisionWithCorrection'),
    fieldVisionColor: t('examinations.form.fieldVisionColor'),
    fieldHearingLeft: t('examinations.form.fieldHearingLeft'),
    fieldHearingRight: t('examinations.form.fieldHearingRight'),
    fieldLungFev1: t('examinations.form.fieldLungFev1'),
    fieldLungFvc: t('examinations.form.fieldLungFvc'),
    fieldLungRatio: t('examinations.form.fieldLungRatio'),
    fieldAdditionalLab: t('examinations.form.fieldAdditionalLab'),
    fieldAdditionalImaging: t('examinations.form.fieldAdditionalImaging'),
    fieldAdditionalOther: t('examinations.form.fieldAdditionalOther'),
    fieldClinicalFindings: t('examinations.form.fieldClinicalFindings'),
    fieldDiagnoses: t('examinations.form.fieldDiagnoses'),
    fieldDiagnosesHelp: t('examinations.form.fieldDiagnosesHelp'),
    fieldRecommendations: t('examinations.form.fieldRecommendations'),
    fieldNotes: t('examinations.form.fieldNotes'),
    fieldVerdict: t('examinations.form.fieldVerdict'),
    fieldVerdictApt: t('examinations.form.verdict.apt'),
    fieldVerdictAptConditionat: t('examinations.form.verdict.apt_conditionat'),
    fieldVerdictInaptTemporar: t('examinations.form.verdict.inapt_temporar'),
    fieldVerdictInapt: t('examinations.form.verdict.inapt'),
    fieldVerdictConditions: t('examinations.form.fieldVerdictConditions'),
    fieldInaptTemporarUntil: t('examinations.form.fieldInaptTemporarUntil'),
    fieldNextDueDate: t('examinations.form.fieldNextDueDate'),
    fieldNextDueDateHelp: t('examinations.form.fieldNextDueDateHelp'),
    fieldExaminedAt: t('examinations.form.examinedAtLabel'),
    fieldExaminedAtHelp: t('examinations.form.examinedAtHelp'),
    saveButton: t('examinations.form.saveButton'),
    saving: t('examinations.form.saving'),
    savedToast: t('examinations.form.savedToast'),
    signedNotice: t('examinations.form.signedNotice'),
    errorMessage: t('examinations.form.errorMessage'),
    sectionInitialIntake: t('examinations.form.sectionInitialIntake'),
    fieldIntakeRutaProfesionala: t('examinations.form.fieldIntakeRutaProfesionala'),
    fieldIntakeMedicFamilie: t('examinations.form.fieldIntakeMedicFamilie'),
    fieldIntakeFumat: t('examinations.form.fieldIntakeFumat'),
    fieldIntakeAlcool: t('examinations.form.fieldIntakeAlcool'),
    fieldIntakeCafea: t('examinations.form.fieldIntakeCafea'),
    fieldIntakeDroguri: t('examinations.form.fieldIntakeDroguri'),
    fieldIntakeEnergizant: t('examinations.form.fieldIntakeEnergizant'),
    fieldIntakeAlergii: t('examinations.form.fieldIntakeAlergii'),
    fieldIntakeSportPerformanta: t('examinations.form.fieldIntakeSportPerformanta'),
    fieldIntakeTratamenteUrmate: t('examinations.form.fieldIntakeTratamenteUrmate'),
    fieldIntakeBoliProfesionale: t('examinations.form.fieldIntakeBoliProfesionale'),
    fieldIntakeBoliProfesionaleDiagnostic: t(
      'examinations.form.fieldIntakeBoliProfesionaleDiagnostic'
    ),
    fieldIntakeAccidenteMunca: t('examinations.form.fieldIntakeAccidenteMunca'),
    fieldIntakeAccidenteMuncaDiagnostic: t('examinations.form.fieldIntakeAccidenteMuncaDiagnostic'),
    fieldIntakeStagiuMilitar: t('examinations.form.fieldIntakeStagiuMilitar'),
    optYes: t('examinations.form.optYes'),
    optNo: t('examinations.form.optNo'),
    optOccasional: t('examinations.form.optOccasional'),
    sectionMaternityRisk: t('examinations.form.sectionMaternityRisk'),
    sectionCertificate: t('examinations.form.sectionCertificate'),
    certApt: t('examinations.form.certApt'),
    certInapt: t('examinations.form.certInapt'),
    certAptConditionat: t('examinations.form.certAptConditionat'),
    certInaptTemporar: t('examinations.form.certInaptTemporar'),
    prefillLoading: t('examinations.form.prefillLoading'),
    prefillReady: t('examinations.form.prefillReady'),
    prefillApply: t('examinations.form.prefillApply'),
    prefillIgnore: t('examinations.form.prefillIgnore'),
    prefillNoData: t('examinations.form.prefillNoData'),
    prefillTooltip: t('examinations.form.prefillTooltip'),
    stepAnamnesis: t('examinations.form.stepAnamnesis'),
    stepClinical: t('examinations.form.stepClinical'),
    stepFindings: t('examinations.form.stepFindings'),
    stepVerdict: t('examinations.form.stepVerdict'),
    stepBack: t('examinations.form.stepBack'),
    stepContinue: t('examinations.form.stepContinue'),
    stepAutoSaved: t('examinations.form.stepAutoSaved'),
    clinExamSystemsTitle: t('examinations.form.clinExamSystemsTitle'),
    clinExamAllNormal: t('examinations.form.clinExamAllNormal'),
    clinExamAllNormalToast: t('examinations.form.clinExamAllNormalToast'),
    clinExamNormalLine: t('examinations.form.clinExamNormalLine'),
    clinExamEdit: t('examinations.form.clinExamEdit'),
    clinExamNoteRequired: t('examinations.form.clinExamNoteRequired'),
    clinExamNotePlaceholder: t('examinations.form.clinExamNotePlaceholder'),
    clinExamConclusionTitle: t('examinations.form.clinExamConclusionTitle'),
    obesityLabel: t('examinations.form.obesityLabel'),
    asymptomaticLabel: t('examinations.form.asymptomaticLabel'),
    suppExamsTitle: t('examinations.form.suppExamsTitle'),
    glycemiaLabel: t('examinations.form.glycemiaLabel'),
    specialtyConclusionTitle: t('examinations.form.specialtyConclusionTitle'),
    sheetLegend: t('examinations.form.sheetLegend'),
    dosarLegend: t('examinations.form.dosarLegend'),
    sheetNonPrinting: t('examinations.form.sheetNonPrinting'),
    sheetStepAnamnesis: t('examinations.form.sheetStepAnamnesis'),
    sheetStepClinic: t('examinations.form.sheetStepClinic'),
    sheetStepInvestigatii: t('examinations.form.sheetStepInvestigatii'),
    sheetStepAviz: t('examinations.form.sheetStepAviz'),
    funcLabel: t('examinations.form.funcLabel'),
    funcMissing: t('examinations.form.funcMissing'),
    sheetSmallBox: t('examinations.form.sheetSmallBox'),
    sheetNoteOnly: t('examinations.form.sheetNoteOnly'),
    viewSheet: t('examinations.form.viewSheet'),
    preSignTitle: t('examinations.form.preSignTitle'),
    preSignAllDone: t('examinations.form.preSignAllDone'),
    preSignFisaBlock: t('examinations.form.preSignFisaBlock'),
    preSignFoaieBlock: t('examinations.form.preSignFoaieBlock'),
    preSignDismiss: t('examinations.form.preSignDismiss'),
    preSignUndismiss: t('examinations.form.preSignUndismiss'),
    preSignDismissed: t('examinations.form.preSignDismissed'),
    preSignReverify: t('examinations.form.preSignReverify'),
    preSignNextDateInfo: t('examinations.form.preSignNextDateInfo'),
    preSignPrintWithout: t('examinations.form.preSignPrintWithout'),
    sheetName: t(
      examinationTypeCode === 'angajare'
        ? 'examinations.form.sheetNameAngajare'
        : 'examinations.form.sheetNamePeriodic'
    ),
    dosarTitle: t('examinations.form.dosarTitle'),
    dosarIdentitySection: t('examinations.form.dosarIdentitySection'),
    dosarFixEmployee: t('examinations.form.dosarFixEmployee'),
    dosarFixCompany: t('examinations.form.dosarFixCompany'),
    dosarCnpPresent: t('examinations.form.dosarCnpPresent'),
    dosarRutaTitle: t('examinations.form.dosarRutaTitle'),
    dosarRutaLegacy: t('examinations.form.dosarRutaLegacy'),
    employerRequirementsTitle: t('examinations.form.employerRequirementsTitle'),
    employerRequirementsAdd: t('examinations.form.employerRequirementsAdd'),
    employerRequirementsHelp: t('examinations.form.employerRequirementsHelp'),
    employerRequirementsOnFisaLabel: t('examinations.form.employerRequirementsOnFisaLabel'),
    employerRequirementsRemove: t('examinations.form.employerRequirementsRemove'),
    employerRequirementsPrintNote: t('examinations.form.employerRequirementsPrintNote'),
  }
}

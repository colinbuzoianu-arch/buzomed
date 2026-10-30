/**
 * Presentation map for the "Examen medical periodic" page (Phase A of the UX
 * spec). For every input shown on a control_periodic examination it says
 * whether the value prints on the official sheet and, if so, WHERE — exactly
 * as the doctor reads it on paper — plus a one-line hint.
 *
 * Source of truth split:
 *  - Clinical systems-exam items (CLINICAL_EXAM_SECTIONS / conclusion /
 *    specialty) derive their ref from the definition via `clinicalItemSheetRef`
 *    — their section number/label is not restated here.
 *  - Everything else lives in PERIODIC_FIELD_REFS, keyed "<bucket>.<key>" or by
 *    the top-level field name.
 *
 * This module is pure data + helpers; it imports nothing from React so it can
 * be used from server and client alike.
 */

export interface SheetRef {
  printed: boolean
  /**
   * Where on the sheet, exactly as the doctor sees it on paper, e.g.
   * "§5 Aparat respirator", "Antet", "Examene suplimentare", "Aviz medical".
   * Omitted when printed === false.
   */
  where?: string
  /** One short sentence for the tooltip / help line. */
  hint?: string
  /** Short example shown as placeholder for free-text fields. */
  example?: string
}

/**
 * Refs for every input that is NOT a clinical systems-exam item. Keys are
 * "<bucket>.<key>" (matching the form state buckets) or a top-level field
 * name. Fields that are plainly internal and need no hint can be omitted —
 * the UI treats "no ref / not printed" the same and groups them under the
 * "Doar în Buzomed" block.
 */
export const PERIODIC_FIELD_REFS: Record<string, SheetRef> = {
  // Antet (header)
  'anamnesis.asymptomatic': {
    printed: true,
    where: 'Antet',
    hint: 'Bifa „Asimpt.: Da / Nu" din antetul foii.',
  },
  'vitalSigns.height': { printed: true, where: 'Antet', hint: 'T, G, IMC din antet.' },
  'vitalSigns.weight': { printed: true, where: 'Antet', hint: 'T, G, IMC din antet.' },
  'vitalSigns.bmi': { printed: true, where: 'Antet', hint: 'T, G, IMC din antet.' },
  'computed.obesity': {
    printed: true,
    where: 'Antet',
    hint: 'Se calculează automat din IMC (≥30 = Da, cu grad I/II/III).',
  },

  // §6 Aparat cardiovascular (vitals row)
  'vitalSigns.bpSystolic': {
    printed: true,
    where: '§6 Aparat cardiovascular',
    hint: 'TA și AV pe rândul aparatului cardiovascular.',
  },
  'vitalSigns.bpDiastolic': {
    printed: true,
    where: '§6 Aparat cardiovascular',
    hint: 'TA și AV pe rândul aparatului cardiovascular.',
  },
  'vitalSigns.pulse': {
    printed: true,
    where: '§6 Aparat cardiovascular',
    hint: 'TA și AV pe rândul aparatului cardiovascular.',
  },
  'vitalSigns.additionalNotes': { printed: false },

  // §10 Analizatori (vision / hearing that print)
  'visionTest.right': { printed: true, where: '§10 Analizatori', hint: 'Acuitate vizuală la distanță.' },
  'visionTest.left': { printed: true, where: '§10 Analizatori', hint: 'Acuitate vizuală la distanță.' },
  'visionTest.withCorrection': {
    printed: true,
    where: '§10 Analizatori',
    hint: 'Acuitate vizuală la distanță.',
  },
  'visionTest.nearRight': { printed: true, where: '§10 Analizatori', hint: 'Vedere de aproape.' },
  'visionTest.nearLeft': { printed: true, where: '§10 Analizatori', hint: 'Vedere de aproape.' },
  'visionTest.nearCorrection': { printed: true, where: '§10 Analizatori', hint: 'Vedere de aproape.' },
  'visionTest.colorResult': { printed: true, where: '§10 Analizatori', hint: 'SCN / Discromat.' },
  'visionTest.colorPerception': {
    printed: true,
    where: '§10 Analizatori',
    hint: 'Nota de lângă vederea cromatică.',
    // TODO(doctor): review wording
    example: 'protanopie',
  },
  'visionTest.additionalNotes': { printed: false },
  'hearingTest.voice': { printed: true, where: '§10 Analizatori', hint: 'Voce tare / șoptită.' },
  'hearingTest.left': {
    printed: false,
    hint: 'Valorile audiometriei nu au loc pe foaie; bifați „Audiograma" la examene suplimentare.',
  },
  'hearingTest.right': {
    printed: false,
    hint: 'Valorile audiometriei nu au loc pe foaie; bifați „Audiograma" la examene suplimentare.',
  },
  'hearingTest.additionalNotes': {
    printed: false,
    hint: 'Valorile audiometriei nu au loc pe foaie; bifați „Audiograma" la examene suplimentare.',
  },

  // Spirometry — never on the sheet
  'lungFunction.fev1': {
    printed: false,
    hint: 'Valorile spirometriei nu au loc pe foaie; bifați „PFV" la examene suplimentare.',
  },
  'lungFunction.fvc': {
    printed: false,
    hint: 'Valorile spirometriei nu au loc pe foaie; bifați „PFV" la examene suplimentare.',
  },
  'lungFunction.ratio': {
    printed: false,
    hint: 'Valorile spirometriei nu au loc pe foaie; bifați „PFV" la examene suplimentare.',
  },
  'lungFunction.additionalNotes': {
    printed: false,
    hint: 'Valorile spirometriei nu au loc pe foaie; bifați „PFV" la examene suplimentare.',
  },

  // Examene suplimentare
  'additionalTests.ordered': {
    printed: true,
    where: 'Examene suplimentare',
    hint: 'Bifele din grila de examene suplimentare.',
  },
  'additionalTests.glycemia': {
    printed: true,
    where: 'Examene suplimentare',
    hint: '„Glicemie valoare: … mg/dl".',
  },
  'additionalTests.laboratory': { printed: false },
  'additionalTests.imaging': { printed: false },
  'additionalTests.other': { printed: false },

  // Findings / verdict (shared with the fișă de aptitudine)
  clinicalFindings: {
    printed: true,
    where: 'Concluziile examinării de specialitate',
    hint: 'Apare și pe fișa de aptitudine.',
    // TODO(doctor): review wording
    example: 'Sănătos clinic; fără contraindicații pentru post',
  },
  diagnoses: { printed: false },
  recommendations: {
    printed: true,
    where: 'Aviz medical → Recomandări',
    hint: 'Apare și pe fișa de aptitudine, dacă „Condiții" e gol.',
    // TODO(doctor): review wording
    example: 'Purtarea ochelarilor de corecție',
  },
  verdict: {
    printed: true,
    where: 'Aviz medical',
    hint: 'APT / APT CONDIȚIONAT / INAPT TEMPORAR / INAPT.',
  },
  verdictConditions: {
    printed: false,
    hint: 'Apare pe fișa de aptitudine, în câmpul din dreapta verdictului — nu pe foaia periodică.',
  },
  examinedAt: {
    printed: true,
    where: 'Antet + Data examinării',
    hint: 'Data din antet și de jos.',
  },
  nextExaminationDueDate: { printed: true, where: 'Data următorului examen' },
  notes: { printed: false, hint: 'Note interne, nu apar pe niciun document.' },

  // Aviz — function comes from the employee record
  'employee.jobTitle': {
    printed: true,
    where: 'Aviz medical',
    hint: 'Se ia din fișa angajatului. Dacă e greșită, corectați-o la angajat.',
  },
}

/** Look up a non-clinical-item field's ref. */
export function getSheetRef(key: string): SheetRef | undefined {
  return PERIODIC_FIELD_REFS[key]
}

// Length caps for printing free-text fields that aren't clinical-exam items,
// from the PDF width rule (floor(widthInPt / 4.5)). The "wide" conclusion/
// recommendation boxes (531pt) wrap up to 3 lines (≈ 118 × 3).
export const COLOR_PERCEPTION_MAX_LENGTH = 20
export const WIDE_FIELD_MAX_LENGTH = 354

/** Ref for a clinical systems-exam item, derived from its section. */
export function clinicalItemSheetRef(sectionNumber: number, sectionLabel: string): SheetRef {
  return { printed: true, where: `§${sectionNumber} ${sectionLabel}` }
}

/**
 * Abbreviate a `where` string to a short pill label: "§5 Aparat respirator" →
 * "§5", "Examene suplimentare" → "Ex. supl.", "Aviz medical → …" → "Aviz", etc.
 */
export function shortWhere(where: string): string {
  if (where.startsWith('§')) return where.split(' ')[0]
  if (where.startsWith('Antet')) return 'Antet'
  if (where.startsWith('Examene suplimentare')) return 'Ex. supl.'
  if (where.startsWith('Aviz')) return 'Aviz'
  if (where.startsWith('Concluzii')) return 'Concluzii'
  if (where.startsWith('Data următorului')) return 'Data urm.'
  if (where.startsWith('Dosar')) return 'Dosar'
  return where
}

/** Sheet ref for a field that prints on the Dosar medical sheet (angajare). */
export const DOSAR_SHEET_REF: SheetRef = {
  printed: true,
  where: 'Dosar medical',
  hint: 'Apare pe Dosarul medical, nu pe fișa de examen.',
}

/** True when a ref points at the Dosar medical sheet (angajare-only). */
export function isDosarSheet(ref: SheetRef): boolean {
  return !!ref.where && ref.where.startsWith('Dosar')
}

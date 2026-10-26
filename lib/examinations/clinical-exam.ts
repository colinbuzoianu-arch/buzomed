/**
 * Declarative definition of the periodic clinical examination (Examen medical
 * periodic — "control_periodic" exam type).
 *
 * This is the SINGLE source of truth from which the UI, validation, the
 * "all normal" button and the PDF mapping are all derived. Each clinical item
 * carries its Romanian label, its kind (choice / text), its options with the
 * PDF checkbox key **without** the `p_` prefix, which option counts as
 * "normal", and an optional free-text note. The PDF route for the periodic
 * sheet adds the `p_` prefix at print time — that single prefix is what makes
 * reusing this definition for the angajare sheet (same positions, no prefix) a
 * one-line change later. Do NOT wire angajare up here (see spec scope).
 *
 * Storage: items whose `source` is `clinicalExam` (the default) are stored on
 * `Examination.clinicalExam` keyed by the item `key` (choice value or text),
 * and notes keyed by their `noteKey`. Items tagged with another source
 * (`vitalSigns`, `visionTest`, `hearingTest`) are shown in sections 6 and 10
 * bound to the EXISTING form state so a value is never stored twice; they are
 * declared here only so the section ordering/labels and the eventual PDF
 * mapping come from one place. `parseClinicalExamInput` deliberately ignores
 * them — their keys are validated with the existing JSONB buckets in the PATCH
 * route (see validators at the bottom of this file).
 *
 * maxLength rule (spec design rule 6): pdf-fill draws one line per field at
 * font size 8, so every text/note length is capped at roughly
 * floor(widthInPt / 4.5) using the widths from field_coordinates.json. The
 * numbers baked in below were computed from the periodic sheet's `p_` fields.
 */

export type ClinicalItemSource = 'clinicalExam' | 'vitalSigns' | 'visionTest' | 'hearingTest'

export interface ClinicalChoiceOption {
  /** Stored value, e.g. 'normal' | 'modificat'. */
  value: string
  /** Romanian UI label. */
  label: string
  /**
   * PDF checkbox key WITHOUT the `p_` prefix. Absent means this option prints
   * no checkbox — i.e. the "modificat" case of a single-normal-checkbox item,
   * which is what makes its note mandatory (see `isNoteRequired`).
   */
  checkboxKey?: string
}

interface ClinicalItemBase {
  /** Storage key inside `clinicalExam` (or inside the external bucket). */
  key: string
  /** Romanian label shown in the UI. */
  label: string
  /** Where the value lives. Defaults to `clinicalExam`. */
  source?: ClinicalItemSource
}

export interface ClinicalChoiceItem extends ClinicalItemBase {
  kind: 'choice'
  options: ClinicalChoiceOption[]
  /** Option value considered "normal". Omitted for conditional items. */
  normal?: string
  /** PDF text key (no `p_` prefix) for the free-text note, if any. */
  noteKey?: string
  /** Max length for the note text (floor(width/4.5)). */
  noteMaxLength?: number
}

export interface ClinicalTextItem extends ClinicalItemBase {
  kind: 'text'
  /** PDF text key (no `p_` prefix). */
  textKey: string
  /** Max length (floor(width/4.5)). */
  maxLength: number
}

export type ClinicalItem = ClinicalChoiceItem | ClinicalTextItem

export interface ClinicalSection {
  number: number
  /** Stable section identifier. */
  key: string
  /** Romanian heading. */
  label: string
  items: ClinicalItem[]
}

// Shared allowed-value sets that both this definition and the PATCH-route
// validators reference, so there is no drift between UI, storage and PDF.
export const COLOR_RESULT_VALUES = ['scn', 'discromat'] as const
export const VOICE_VALUES = ['tare', 'soptita'] as const
export const ASYMPTOMATIC_VALUES = ['da', 'nu'] as const

/**
 * Supplementary exams (Investigații), in the exact order they appear on the
 * sheet. Stored as `additionalTests.ordered: string[]` of these keys; the PDF
 * checkbox is `ex_<key>` (periodic: `p_ex_<key>`). Labels are exactly as
 * printed on the official form.
 */
export const SUPPLEMENTARY_EXAMS: Array<{ key: string; label: string }> = [
  { key: 'oftalmo', label: 'Oftalmologic' },
  { key: 'pfv', label: 'PFV' },
  { key: 'rpa', label: 'RPA' },
  { key: 'coproparaz', label: 'Ex. Coproparazit.' },
  { key: 'glicemie', label: 'Glicemie' },
  { key: 'orl', label: 'ex. ORL' },
  { key: 'audio', label: 'Audiograma' },
  { key: 'ekg', label: 'EKG' },
  { key: 'hemo', label: 'Hemoleucogramă' },
  { key: 'clinic', label: 'Examen Clinic' },
  { key: 'neuro', label: 'ex. Neurologic' },
  { key: 'psiho', label: 'ex. Psihologic' },
  { key: 'psihiatric', label: 'ex. Psihiatric' },
  { key: 'coprobact', label: 'Ex. Coprobact.' },
  { key: 'creatinina', label: 'Creatinină' },
  { key: 'carnet', label: 'Carnet de MM' },
  { key: 'sumar', label: 'Sumar urină' },
  { key: 'medst', label: 'Medical ST' },
  { key: 'psihost', label: 'Psihologic ST' },
  { key: 'got', label: 'GOT' },
  { key: 'gpt', label: 'GPT' },
  { key: 'ggt', label: 'GGT' },
  { key: 'hcv', label: 'Ac HCV' },
  { key: 'hbs', label: 'Ag HBs' },
  { key: 'hiv', label: 'HIV' },
  { key: 'arma', label: 'Port armă' },
  { key: 'altele', label: 'Altele' },
]

export const SUPPLEMENTARY_EXAM_KEYS = new Set(SUPPLEMENTARY_EXAMS.map((e) => e.key))

// Free-text "normal" defaults for the Clinic step's text items, keyed by item
// `key`. The "all normal" button fills unset text items from here. These are
// provisional wordings to be confirmed by the doctor — kept in one place so
// they are trivial to change (spec "Ask the doctor").
// TODO(doctor): confirm the exact wording the doctor uses for each of these.
export const CLINICAL_EXAM_TEXT_DEFAULTS: Record<string, string> = {
  varice: 'absente',
  tranzit: 'normal',
  mers: 'normal',
  fortaSegmentara: 'păstrată',
  miscariInvoluntare: 'absente',
  endocrin: 'fără modificări',
}

// Near-vision acuity / correction length caps (vap_* fields on the sheet).
export const VISION_NEAR_ACUITY_MAX_LENGTH = 6
export const VISION_NEAR_CORRECTION_MAX_LENGTH = 57

// "În limite normale" note caps are tiny on the sheet — a couple of these note
// boxes only fit ~10 characters. The UI will show a counter; validation cuts
// over-long notes off here rather than letting pdf-fill silently truncate.

export const CLINICAL_EXAM_SECTIONS: ClinicalSection[] = [
  {
    number: 1,
    key: 'tegumenteMucoase',
    label: 'Tegumente și mucoase',
    items: [
      {
        key: 'tegumente',
        label: 'Tegumente și mucoase',
        kind: 'choice',
        normal: 'normal',
        noteKey: 'tegumente_nota',
        noteMaxLength: 62,
        options: [
          { value: 'normal', label: 'Normal', checkboxKey: 'tegumente_normal' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
    ],
  },
  {
    number: 2,
    key: 'tesutCelularSubcutanat',
    label: 'Țesut celular subcutanat',
    items: [
      {
        key: 'tcs',
        label: 'Țesut celular subcutanat',
        kind: 'choice',
        normal: 'normal',
        options: [
          { value: 'slab', label: 'Slab reprezentat', checkboxKey: 'tcs_slab' },
          { value: 'normal', label: 'Normal', checkboxKey: 'tcs_normal' },
          { value: 'bine', label: 'Bine reprezentat', checkboxKey: 'tcs_bine' },
        ],
      },
      {
        key: 'edeme',
        label: 'Edeme',
        kind: 'choice',
        normal: 'nu',
        options: [
          { value: 'nu', label: 'Nu', checkboxKey: 'edeme_nu' },
          { value: 'da', label: 'Da', checkboxKey: 'edeme_da' },
        ],
      },
    ],
  },
  {
    number: 3,
    key: 'sistemGanglionar',
    label: 'Sistem ganglionar',
    items: [
      {
        key: 'ganglioni',
        label: 'Ganglioni',
        kind: 'choice',
        normal: 'nepalpabil',
        noteKey: 'ganglion_nota',
        noteMaxLength: 73,
        options: [
          { value: 'nepalpabil', label: 'Nepalpabili', checkboxKey: 'ganglion_nepalpabil' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
    ],
  },
  {
    number: 4,
    key: 'aparatLocomotor',
    label: 'Aparat locomotor',
    items: [
      {
        key: 'locomotor',
        label: 'Aparat locomotor',
        kind: 'choice',
        normal: 'integru',
        noteKey: 'loco_nota',
        noteMaxLength: 62,
        options: [
          { value: 'integru', label: 'Integru', checkboxKey: 'loco_integru' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
    ],
  },
  {
    number: 5,
    key: 'aparatRespirator',
    label: 'Aparat respirator',
    items: [
      {
        key: 'torace',
        label: 'Torace',
        kind: 'choice',
        normal: 'normal',
        noteKey: 'torace_nota',
        noteMaxLength: 12,
        options: [
          { value: 'normal', label: 'Normal', checkboxKey: 'torace_normal' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'ampliatii',
        label: 'Ampliații respiratorii',
        kind: 'choice',
        normal: 'simetrice',
        noteKey: 'ampl_nota',
        noteMaxLength: 13,
        options: [
          { value: 'simetrice', label: 'Simetrice', checkboxKey: 'ampl_simetrice' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'sonoritate',
        label: 'Sonoritate pulmonară',
        kind: 'choice',
        normal: 'normala',
        noteKey: 'sonor_nota',
        noteMaxLength: 11,
        options: [
          { value: 'normala', label: 'Normală', checkboxKey: 'sonor_normala' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'murmur',
        label: 'Murmur vezicular',
        kind: 'choice',
        normal: 'prezent',
        noteKey: 'murmur_nota',
        noteMaxLength: 11,
        options: [
          { value: 'prezent', label: 'Prezent', checkboxKey: 'murmur_prezent' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'raluri',
        label: 'Raluri',
        kind: 'choice',
        normal: 'nu',
        options: [
          { value: 'nu', label: 'Nu', checkboxKey: 'raluri_nu' },
          { value: 'da', label: 'Da', checkboxKey: 'raluri_da' },
        ],
      },
    ],
  },
  {
    number: 6,
    key: 'aparatCardiovascular',
    label: 'Aparat cardiovascular',
    // TA and AV are the existing `vitalSigns` inputs (bpSystolic/bpDiastolic
    // and pulse) and are NOT stored here — they are shown in this section bound
    // to the vitals form. The items below are the periodic-only additions.
    items: [
      {
        key: 'ritm',
        label: 'Ritm cardiac',
        kind: 'choice',
        normal: 'regulat',
        options: [
          { value: 'regulat', label: 'Regulat', checkboxKey: 'ritm_regulat' },
          { value: 'neregulat', label: 'Neregulat', checkboxKey: 'ritm_neregulat' },
        ],
      },
      {
        key: 'sufluri',
        label: 'Sufluri',
        kind: 'choice',
        normal: 'nu',
        options: [
          { value: 'nu', label: 'Nu', checkboxKey: 'sufluri_nu' },
          { value: 'da', label: 'Da', checkboxKey: 'sufluri_da' },
        ],
      },
      {
        key: 'pulsPeriferic',
        label: 'Puls periferic',
        kind: 'choice',
        normal: 'prezent',
        options: [
          { value: 'prezent', label: 'Prezent', checkboxKey: 'puls_prezent' },
          { value: 'absent', label: 'Absent', checkboxKey: 'puls_absent' },
        ],
      },
      {
        key: 'varice',
        label: 'Varice',
        kind: 'text',
        textKey: 'varice',
        maxLength: 50,
      },
    ],
  },
  {
    number: 7,
    key: 'aparatDigestiv',
    label: 'Aparat digestiv',
    items: [
      {
        key: 'abdomen',
        label: 'Abdomen',
        kind: 'choice',
        normal: 'nedureros',
        options: [
          { value: 'nedureros', label: 'Nedureros', checkboxKey: 'abd_nedureros' },
          { value: 'dureros', label: 'Dureros', checkboxKey: 'abd_dureros' },
        ],
      },
      {
        // Conditional sub-item shown only when abdomen is 'dureros'. It has no
        // "normal" value, so the "all normal" button never sets it.
        key: 'abdomenPalpare',
        label: 'La palpare',
        kind: 'choice',
        options: [
          { value: 'superficial', label: 'Superficial', checkboxKey: 'abd_super' },
          { value: 'profund', label: 'Profund', checkboxKey: 'abd_profund' },
        ],
      },
      {
        key: 'ficat',
        label: 'Ficat',
        kind: 'choice',
        normal: 'normal',
        noteKey: 'ficat_nota',
        noteMaxLength: 13,
        options: [
          { value: 'normal', label: 'În limite normale', checkboxKey: 'ficat_normal' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'splina',
        label: 'Splină',
        kind: 'choice',
        normal: 'normala',
        noteKey: 'splina_nota',
        noteMaxLength: 10,
        options: [
          { value: 'normala', label: 'În limite normale', checkboxKey: 'splina_normala' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'tranzit',
        label: 'Tranzit intestinal',
        kind: 'text',
        textKey: 'tranzit',
        maxLength: 11,
      },
    ],
  },
  {
    number: 8,
    key: 'aparatUrogenital',
    label: 'Aparat urogenital',
    items: [
      {
        // The sheet has no note box for loje renale. Whether "modificat" needs
        // a note is an open question for the doctor (spec "Ask the doctor").
        // TODO(doctor): does "Loje renale: modificat" need a note? No box today.
        key: 'lojeRenale',
        label: 'Loje renale',
        kind: 'choice',
        normal: 'libere',
        options: [
          { value: 'libere', label: 'Libere', checkboxKey: 'loje_libere' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
      {
        key: 'giordano',
        label: 'Semnul Giordano',
        kind: 'choice',
        normal: 'negativ',
        options: [
          { value: 'negativ', label: 'Negativ bilateral', checkboxKey: 'giordano_neg' },
          { value: 'pozitiv', label: 'Pozitiv', checkboxKey: 'giordano_poz' },
        ],
      },
      {
        key: 'mictiuni',
        label: 'Micțiuni',
        kind: 'choice',
        normal: 'fiziologice',
        noteKey: 'mictiuni_nota',
        noteMaxLength: 69,
        options: [
          { value: 'fiziologice', label: 'Fiziologice', checkboxKey: 'mictiuni_ok' },
          { value: 'modificat', label: 'Modificat' },
        ],
      },
    ],
  },
  {
    number: 9,
    key: 'sistemNervos',
    label: 'Sistem nervos',
    items: [
      {
        // Two-option item that also carries a note: both options print a
        // checkbox, so the note is OPTIONAL even when "prezent" is selected.
        key: 'nistagmus',
        label: 'Nistagmus',
        kind: 'choice',
        normal: 'absent',
        noteKey: 'nist_nota',
        noteMaxLength: 11,
        options: [
          { value: 'absent', label: 'Absent', checkboxKey: 'nist_absent' },
          { value: 'prezent', label: 'Prezent', checkboxKey: 'nist_prezent' },
        ],
      },
      {
        key: 'romberg',
        label: 'Proba Romberg',
        kind: 'choice',
        normal: 'negativ',
        options: [
          { value: 'negativ', label: 'Negativ', checkboxKey: 'romberg_neg' },
          { value: 'pozitiv', label: 'Pozitiv', checkboxKey: 'romberg_poz' },
        ],
      },
      {
        key: 'rot',
        label: 'ROT',
        kind: 'choice',
        normal: 'prezente',
        options: [
          { value: 'prezente', label: 'Prezente', checkboxKey: 'rot_prezente' },
          { value: 'absente', label: 'Absente', checkboxKey: 'rot_absente' },
        ],
      },
      { key: 'mers', label: 'Mers', kind: 'text', textKey: 'mers', maxLength: 13 },
      {
        key: 'fortaSegmentara',
        label: 'Forță segmentară',
        kind: 'text',
        textKey: 'forta',
        maxLength: 13,
      },
      {
        key: 'miscariInvoluntare',
        label: 'Mișcări involuntare',
        kind: 'text',
        textKey: 'misc_invol',
        maxLength: 22,
      },
    ],
  },
  {
    number: 10,
    key: 'analizatori',
    label: 'Analizatori',
    // Everything in this section lives on the existing `visionTest` /
    // `hearingTest` buckets (never on clinicalExam). Declared here only so the
    // section can be rendered and later mapped to the PDF from one place.
    items: [
      {
        key: 'right',
        label: 'AV la distanță — OD',
        kind: 'text',
        source: 'visionTest',
        textKey: 'av_vod',
        maxLength: VISION_NEAR_ACUITY_MAX_LENGTH,
      },
      {
        key: 'left',
        label: 'AV la distanță — OS',
        kind: 'text',
        source: 'visionTest',
        textKey: 'av_vos',
        maxLength: VISION_NEAR_ACUITY_MAX_LENGTH,
      },
      {
        key: 'withCorrection',
        label: 'AV la distanță — cu corecție',
        kind: 'text',
        source: 'visionTest',
        textKey: 'av_corectie',
        maxLength: 60,
      },
      {
        key: 'nearRight',
        label: 'AV de aproape — OD',
        kind: 'text',
        source: 'visionTest',
        textKey: 'vap_vod',
        maxLength: VISION_NEAR_ACUITY_MAX_LENGTH,
      },
      {
        key: 'nearLeft',
        label: 'AV de aproape — OS',
        kind: 'text',
        source: 'visionTest',
        textKey: 'vap_vos',
        maxLength: VISION_NEAR_ACUITY_MAX_LENGTH,
      },
      {
        key: 'nearCorrection',
        label: 'AV de aproape — cu corecție',
        kind: 'text',
        source: 'visionTest',
        textKey: 'vap_corectie',
        maxLength: VISION_NEAR_CORRECTION_MAX_LENGTH,
      },
      {
        key: 'colorResult',
        label: 'Simț cromatic',
        kind: 'choice',
        source: 'visionTest',
        normal: 'scn',
        // The existing free-text `visionTest.colorPerception` is this item's
        // note on the sheet (crom_nota). It is not newly validated here.
        noteKey: 'crom_nota',
        options: [
          { value: 'scn', label: 'SCN', checkboxKey: 'crom_scn' },
          { value: 'discromat', label: 'Discromat', checkboxKey: 'crom_discromat' },
        ],
      },
      {
        // DEFAULT (confirm with doctor): "șoptită" is treated as the normal
        // result — hearing a whispered voice at distance indicates normal
        // acuity. Change `normal` here if the doctor ticks the other one.
        // Note: the "all normal" button never touches voice (spec), so this
        // default only pre-marks the expected value in the UI/reference.
        key: 'voice',
        label: 'Voce',
        kind: 'choice',
        source: 'hearingTest',
        normal: 'soptita',
        options: [
          { value: 'tare', label: 'Tare', checkboxKey: 'voce_tare' },
          { value: 'soptita', label: 'Șoptită', checkboxKey: 'voce_soptita' },
        ],
      },
    ],
  },
  {
    number: 11,
    key: 'sistemEndocrin',
    label: 'Sistem endocrin',
    items: [
      {
        key: 'endocrin',
        label: 'Sistem endocrin',
        kind: 'text',
        textKey: 'endocrin',
        maxLength: 96,
      },
    ],
  },
]

/**
 * Clinical conclusion items (end of the Clinic step), stored on clinicalExam.
 * `conclusionText` replaces the old use of `clinicalFindings` for the periodic
 * sheet's `concl_text` (spec). `concl_text` is one of the wide 531pt fields;
 * its cap here is the single-line estimate — Phase 4 confirms wrapping.
 */
export const CLINICAL_CONCLUSION_ITEMS: ClinicalItem[] = [
  {
    key: 'conclusion',
    label: 'Concluzii examen clinic',
    kind: 'choice',
    normal: 'sanatos',
    options: [
      { value: 'sanatos', label: 'Sănătos', checkboxKey: 'concl_sanatos' },
      { value: 'diagnostic', label: 'Cu diagnostic', checkboxKey: 'concl_diag' },
    ],
  },
  {
    key: 'conclusionText',
    label: 'Diagnostic / observații',
    kind: 'text',
    textKey: 'concl_text',
    maxLength: 118,
  },
]

/**
 * "Concluziile examinării de specialitate" (Investigații step). Stored on
 * clinicalExam as a choice; the accompanying free text stays the existing
 * top-level `clinicalFindings` (→ spec_text), so the fișa-de-aptitudine
 * renderings that read clinicalFindings are unaffected.
 */
export const CLINICAL_SPECIALTY_CONCLUSION: ClinicalChoiceItem = {
  key: 'specialtyConclusion',
  label: 'Concluziile examinării de specialitate',
  kind: 'choice',
  normal: 'sanatos',
  options: [
    { value: 'sanatos', label: 'Sănătos clinic', checkboxKey: 'spec_sanatos' },
    { value: 'diagnostic', label: 'Cu diagnostic', checkboxKey: 'spec_diag' },
  ],
}

export const effectiveSource = (item: ClinicalItem): ClinicalItemSource =>
  item.source ?? 'clinicalExam'

/**
 * Obesity status derived from BMI, for the sheet's obez_nu / obez_da / obez_gr
 * positions. Computed at render/print time — never stored (spec header map).
 *   BMI < 30   → not obese
 *   30–34.9    → grade I
 *   35–39.9    → grade II
 *   ≥ 40       → grade III
 */
export function computeObesityFromBmi(bmi: number | null | undefined): {
  obese: boolean
  grade: '' | 'I' | 'II' | 'III'
} {
  if (bmi === null || bmi === undefined || !Number.isFinite(bmi) || bmi < 30) {
    return { obese: false, grade: '' }
  }
  if (bmi < 35) return { obese: true, grade: 'I' }
  if (bmi < 40) return { obese: true, grade: 'II' }
  return { obese: true, grade: 'III' }
}

/**
 * Items the "Toate aparatele în limite normale" button may fill: the
 * systems-exam items across sections 1–11 whose source is `clinicalExam`, plus
 * the clinical conclusion. Section 10 (analizatori) and the section 6 vitals
 * are excluded (they live on their own JSONB buckets), and so is the specialty
 * conclusion (set by hand in the Investigații step).
 */
export const CLINICAL_ALL_NORMAL_ITEMS: ClinicalItem[] = [
  ...CLINICAL_EXAM_SECTIONS.flatMap((s) => s.items),
  ...CLINICAL_CONCLUSION_ITEMS,
].filter((item) => effectiveSource(item) === 'clinicalExam')

/**
 * Every item physically stored on `Examination.clinicalExam` — the "all
 * normal" set plus the specialty conclusion. Used to build the whitelist and
 * drive validation.
 */
export const CLINICAL_EXAM_STORED_ITEMS: ClinicalItem[] = [
  ...CLINICAL_ALL_NORMAL_ITEMS,
  CLINICAL_SPECIALTY_CONCLUSION,
]

// Whitelist of keys that may appear in a stored clinicalExam object: each
// stored item's `key`, plus the `noteKey` of any choice item that has a note.
const CLINICAL_EXAM_WHITELIST: Set<string> = (() => {
  const set = new Set<string>()
  for (const item of CLINICAL_EXAM_STORED_ITEMS) {
    set.add(item.key)
    if (item.kind === 'choice' && item.noteKey) set.add(item.noteKey)
  }
  return set
})()

/**
 * A single-normal-checkbox item requires its note when the chosen option
 * prints no checkbox of its own (the "modificat" case). Two-option items whose
 * abnormal option carries its own checkbox (e.g. nistagmus) never require it.
 */
function optionHasNoCheckbox(item: ClinicalChoiceItem, value: string): boolean {
  const opt = item.options.find((o) => o.value === value)
  return !!opt && opt.checkboxKey === undefined
}

/**
 * Validate and sanitize an incoming `clinicalExam` object. Returns a cleaned
 * object containing only whitelisted, well-formed values (trimmed strings).
 * Pushes human-readable messages onto `issues` for anything rejected:
 *   - unknown keys
 *   - choice values outside the declared options
 *   - text / note values over the field's maxLength
 *   - a missing note where "modificat" (no checkbox) was selected
 *
 * The whole object is replaced on each PATCH, so requiredness is evaluated
 * against this same payload.
 */
export function parseClinicalExamInput(input: unknown, issues: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (input === null || input === undefined) return out
  if (typeof input !== 'object' || Array.isArray(input)) {
    issues.push('clinicalExam must be an object')
    return out
  }
  const obj = input as Record<string, unknown>

  // Reject anything not in the whitelist — catch client bugs early rather than
  // silently storing junk (owner preference).
  for (const key of Object.keys(obj)) {
    if (!CLINICAL_EXAM_WHITELIST.has(key)) {
      issues.push(`clinicalExam: unknown field "${key}"`)
    }
  }

  for (const item of CLINICAL_EXAM_STORED_ITEMS) {
    const raw = obj[item.key]

    if (item.kind === 'choice') {
      if (raw !== undefined && raw !== null && raw !== '') {
        if (typeof raw !== 'string' || !item.options.some((o) => o.value === raw)) {
          issues.push(
            `clinicalExam.${item.key} must be one of: ${item.options.map((o) => o.value).join(', ')}`
          )
        } else {
          out[item.key] = raw
        }
      }

      // Note handling, if this item has one.
      if (item.noteKey) {
        const rawNote = obj[item.noteKey]
        if (rawNote !== undefined && rawNote !== null) {
          if (typeof rawNote !== 'string') {
            issues.push(`clinicalExam.${item.noteKey} must be a string`)
          } else {
            const trimmed = rawNote.trim()
            const max = item.noteMaxLength ?? 0
            if (max > 0 && trimmed.length > max) {
              issues.push(`clinicalExam.${item.noteKey} must be at most ${max} characters`)
            } else if (trimmed !== '') {
              out[item.noteKey] = trimmed
            }
          }
        }
      }
    } else {
      // text item
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== 'string') {
          issues.push(`clinicalExam.${item.key} must be a string`)
        } else {
          const trimmed = raw.trim()
          if (trimmed.length > item.maxLength) {
            issues.push(`clinicalExam.${item.key} must be at most ${item.maxLength} characters`)
          } else if (trimmed !== '') {
            out[item.key] = trimmed
          }
        }
      }
    }
  }

  // Note-required rule: a "modificat"-style selection (chosen option prints no
  // checkbox) must carry a non-empty note.
  for (const item of CLINICAL_EXAM_STORED_ITEMS) {
    if (item.kind !== 'choice' || !item.noteKey) continue
    const selected = out[item.key]
    if (!selected) continue
    if (optionHasNoCheckbox(item, selected) && !out[item.noteKey]) {
      issues.push(`clinicalExam.${item.noteKey} is required when ${item.key} is "${selected}"`)
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Validators for the periodic-only keys that live inside the EXISTING JSONB
// buckets (visionTest / hearingTest / anamnesis / additionalTests). They only
// inspect the keys the periodic sheet adds and leave every other key the
// client sends untouched, so non-periodic exams are unaffected. Each returns a
// shallow clone with the inspected keys normalized.
// ---------------------------------------------------------------------------

function cloneObject(value: object): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) }
}

function checkChoice(
  obj: Record<string, unknown>,
  out: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  issues: string[]
) {
  if (!(key in obj)) return
  const v = obj[key]
  if (v === null || v === '' || v === undefined) {
    out[key] = undefined
    return
  }
  if (typeof v !== 'string' || !allowed.includes(v)) {
    issues.push(`${key} must be one of: ${allowed.join(', ')}`)
  }
}

function checkText(
  obj: Record<string, unknown>,
  out: Record<string, unknown>,
  key: string,
  maxLength: number,
  issues: string[]
) {
  if (!(key in obj)) return
  const v = obj[key]
  if (v === null || v === undefined) {
    out[key] = undefined
    return
  }
  if (typeof v !== 'string') {
    issues.push(`${key} must be a string`)
    return
  }
  const trimmed = v.trim()
  if (trimmed.length > maxLength) {
    issues.push(`${key} must be at most ${maxLength} characters`)
    return
  }
  out[key] = trimmed === '' ? undefined : trimmed
}

/** anamnesis.asymptomatic ∈ {da, nu}. */
export function validateAnamnesisPeriodic(value: object, issues: string[]): Record<string, unknown> {
  const obj = cloneObject(value)
  checkChoice(obj, obj, 'asymptomatic', ASYMPTOMATIC_VALUES, issues)
  return obj
}

/** visionTest.near{Right,Left,Correction} (text) and colorResult ∈ {scn, discromat}. */
export function validateVisionTestPeriodic(value: object, issues: string[]): Record<string, unknown> {
  const obj = cloneObject(value)
  checkText(obj, obj, 'nearRight', VISION_NEAR_ACUITY_MAX_LENGTH, issues)
  checkText(obj, obj, 'nearLeft', VISION_NEAR_ACUITY_MAX_LENGTH, issues)
  checkText(obj, obj, 'nearCorrection', VISION_NEAR_CORRECTION_MAX_LENGTH, issues)
  checkChoice(obj, obj, 'colorResult', COLOR_RESULT_VALUES, issues)
  return obj
}

/** hearingTest.voice ∈ {tare, soptita}. */
export function validateHearingTestPeriodic(value: object, issues: string[]): Record<string, unknown> {
  const obj = cloneObject(value)
  checkChoice(obj, obj, 'voice', VOICE_VALUES, issues)
  return obj
}

/**
 * additionalTests.ordered: string[] of SUPPLEMENTARY_EXAM_KEYS; glycemia: a
 * finite non-negative number (mg/dl). Other additionalTests keys (free-text
 * lab/imaging/other) pass through unchanged.
 */
export function validateAdditionalTestsPeriodic(
  value: object,
  issues: string[]
): Record<string, unknown> {
  const obj = cloneObject(value)

  if ('ordered' in obj && obj.ordered !== undefined && obj.ordered !== null) {
    const ordered = obj.ordered
    if (!Array.isArray(ordered)) {
      issues.push('additionalTests.ordered must be an array of exam keys')
    } else {
      const seen = new Set<string>()
      for (const entry of ordered) {
        if (typeof entry !== 'string' || !SUPPLEMENTARY_EXAM_KEYS.has(entry)) {
          issues.push(`additionalTests.ordered contains an unknown exam key: ${String(entry)}`)
        } else {
          seen.add(entry)
        }
      }
      // Normalize to a de-duplicated list in the sheet's canonical order.
      obj.ordered = SUPPLEMENTARY_EXAMS.map((e) => e.key).filter((k) => seen.has(k))
    }
  }

  if ('glycemia' in obj && obj.glycemia !== undefined && obj.glycemia !== null && obj.glycemia !== '') {
    const n = typeof obj.glycemia === 'string' ? Number(obj.glycemia) : obj.glycemia
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      issues.push('additionalTests.glycemia must be a non-negative number')
    } else {
      obj.glycemia = n
    }
  }

  return obj
}

// ---------------------------------------------------------------------------
// PDF field builder (Phase 4). Produces the periodic sheet's fields from this
// definition, keyed WITHOUT the `p_` prefix — the PDF route adds `p_` for the
// periodic sheet, which is what makes reusing this for the angajare sheet
// (same keys, no prefix) a later one-line change. Empty values emit nothing,
// so an examination with an empty clinicalExam prints no systems-exam marks.
// ---------------------------------------------------------------------------

export interface PeriodicExamPdfInput {
  clinicalExam: Record<string, unknown>
  visionTest: Record<string, unknown>
  hearingTest: Record<string, unknown>
  anamnesis: Record<string, unknown>
  additionalTests: Record<string, unknown>
  vitalSigns: Record<string, unknown>
}

export function buildPeriodicExamFields(
  input: PeriodicExamPdfInput
): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {}
  const s = (o: Record<string, unknown>, k: string): string => {
    const v = o?.[k]
    return v !== null && v !== undefined && v !== '' ? String(v) : ''
  }
  const bucketFor = (item: ClinicalItem): Record<string, unknown> => {
    switch (effectiveSource(item)) {
      case 'visionTest':
        return input.visionTest
      case 'hearingTest':
        return input.hearingTest
      default:
        return input.clinicalExam
    }
  }

  const allItems: ClinicalItem[] = [
    ...CLINICAL_EXAM_SECTIONS.flatMap((sec) => sec.items),
    ...CLINICAL_CONCLUSION_ITEMS,
    CLINICAL_SPECIALTY_CONCLUSION,
  ]

  for (const item of allItems) {
    const val = s(bucketFor(item), item.key)
    if (item.kind === 'choice') {
      if (val) {
        const opt = item.options.find((o) => o.value === val)
        // Only options with a checkbox print one; "modificat" prints nothing
        // (its note carries the detail instead).
        if (opt?.checkboxKey) fields[opt.checkboxKey] = true
      }
      // Notes are stored on clinicalExam, except the color-perception note,
      // which is the existing free text on visionTest (crom_nota).
      if (item.noteKey && effectiveSource(item) === 'clinicalExam') {
        const note = s(input.clinicalExam, item.noteKey)
        if (note) fields[item.noteKey] = note
      }
    } else if (val) {
      fields[item.textKey] = val
    }
  }

  // Color-perception note (crom_nota) ← existing visionTest.colorPerception.
  const colorNote = s(input.visionTest, 'colorPerception')
  if (colorNote) fields.crom_nota = colorNote

  // Asymptomatic (asimpt_da / asimpt_nu) ← anamnesis.asymptomatic.
  const asymptomatic = s(input.anamnesis, 'asymptomatic')
  if (asymptomatic === 'da') fields.asimpt_da = true
  else if (asymptomatic === 'nu') fields.asimpt_nu = true

  // Obesity (obez_nu / obez_da + obez_gr) computed from BMI at print time.
  const bmiStr = s(input.vitalSigns, 'bmi')
  if (bmiStr !== '') {
    const { obese, grade } = computeObesityFromBmi(Number(bmiStr))
    if (obese) {
      fields.obez_da = true
      fields.obez_gr = grade
    } else {
      fields.obez_nu = true
    }
  }

  // Supplementary exams (ex_<key>) + glycemia value.
  const orderedRaw = input.additionalTests?.ordered
  if (Array.isArray(orderedRaw)) {
    for (const key of orderedRaw) {
      if (typeof key === 'string' && SUPPLEMENTARY_EXAM_KEYS.has(key)) {
        fields[`ex_${key}`] = true
      }
    }
  }
  const glycemia = s(input.additionalTests, 'glycemia')
  if (glycemia) fields.glicemie_val = glycemia

  return fields
}

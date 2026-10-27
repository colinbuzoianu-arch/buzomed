/**
 * Declarative definition of the "Dosar medical" sheet for the angajare exam
 * type. One list drives the Anamneză-step UI, the PATCH validation of the new
 * `intake_*` keys, and the PDF field mapping — the same pattern as
 * clinical-exam.ts.
 *
 * Storage: the existing `anamnesis` bucket (reusing the existing `intake_*`
 * keys — never renamed, so old exams keep their data) plus the employee /
 * company record (identity fields, shown read-only and printed, never stored
 * twice). No schema change.
 *
 * Ruta profesională is migration-free: `anamnesis.intake_ruta_profesionala`
 * may hold the OLD free-text string or the NEW array of up to 4 rows
 * {firma, post, perioada, functia, noxa}. A string prints truncated into row 1.
 */

export type DosarFieldKind = 'text' | 'yesno' | 'yesnoocaz' | 'select' | 'checkbox'

export interface DosarIntakeField {
  /** anamnesis key. */
  key: string
  label: string
  kind: DosarFieldKind
  /** Dosar PDF key this field prints into (for the sheet marker / checklist). */
  pdfKey: string
  maxLength?: number
  /** For `select`. */
  options?: Array<{ value: string; label: string }>
  /** Only render/print when the employee's gender is 'F'. */
  femaleOnly?: boolean
  /** One short sentence for the Dosar sheet-marker tooltip / help line. */
  hint?: string
}

export interface DosarSection {
  key: string
  title: string
  fields: DosarIntakeField[]
}

export interface RutaRow {
  firma: string
  post: string
  perioada: string
  functia: string
  noxa: string
}

export const RUTA_COLS = ['firma', 'post', 'perioada', 'functia', 'noxa'] as const
export const RUTA_MAX_ROWS = 4
// maxLengths from the regenerated Dosar coordinates (width ÷ 4.5).
export const RUTA_COL_MAXLEN: Record<(typeof RUTA_COLS)[number], number> = {
  firma: 33,
  post: 26,
  perioada: 20,
  functia: 20,
  noxa: 18,
}

const YESNO = [
  { value: '', label: '—' },
  { value: 'nu', label: 'Nu' },
  { value: 'da', label: 'Da' },
]

/**
 * Anamneză-step layout for angajare, in Dosar-medical order. Identity fields
 * (from the employee/company record) and the ruta table are handled separately
 * in the step — this list covers the `anamnesis`-stored inputs.
 */
export const DOSAR_SECTIONS: DosarSection[] = [
  {
    key: 'identificare',
    title: 'Date de identificare',
    fields: [
      {
        key: 'intake_formare_profesionala',
        label: 'Formare profesională',
        kind: 'text',
        pdfKey: 'formare',
        maxLength: 33,
        hint: 'Nivelul de studii / calificarea angajatului.',
      },
      {
        key: 'intake_activitati_loc_munca',
        label: 'Activități îndeplinite la locul de muncă',
        kind: 'text',
        pdfKey: 'activitati_loc_munca',
        maxLength: 79,
        hint: 'Ce face efectiv angajatul la locul de muncă.',
      },
      {
        key: 'intake_medic_familie',
        label: 'Medic de familie',
        kind: 'text',
        pdfKey: 'medic_familie',
        maxLength: 100,
        hint: 'Numele medicului de familie.',
      },
    ],
  },
  {
    key: 'declaratii',
    title: 'Declarații',
    fields: [
      {
        key: 'intake_invaliditate',
        label: 'Grad de invaliditate',
        kind: 'select',
        pdfKey: 'invalid_da',
        options: YESNO,
        hint: 'Dacă angajatul are grad de invaliditate recunoscut.',
      },
      {
        key: 'intake_grad_invaliditate',
        label: 'Gradul',
        kind: 'select',
        pdfKey: 'grad_inv',
        options: [
          { value: '', label: '—' },
          { value: 'I', label: 'I' },
          { value: 'II', label: 'II' },
          { value: 'III', label: 'III' },
        ],
        hint: 'Gradul (I / II / III), doar dacă există invaliditate.',
      },
      {
        key: 'intake_evidenta_itm',
        label: 'În evidență ITM',
        kind: 'yesno',
        pdfKey: 'itm_da',
        hint: 'Dacă este în evidența Inspectoratului Teritorial de Muncă.',
      },
    ],
  },
  {
    key: 'heredo',
    title: 'Antecedente heredo-colaterale',
    fields: [
      {
        // Existing anamnesis.familyHistory prints as antec_heredo.
        key: 'familyHistory',
        label: 'Antecedente heredo-colaterale',
        kind: 'text',
        pdfKey: 'antec_heredo',
        maxLength: 50,
        hint: 'Boli relevante în familie.',
      },
      {
        key: 'intake_heredo_fara_importanta',
        label: 'Fără importanță patologică',
        kind: 'checkbox',
        pdfKey: 'heredo_fara_imp',
        hint: 'Bifați dacă antecedentele familiale nu au relevanță.',
      },
    ],
  },
  {
    key: 'personale',
    title: 'Antecedente personale fiziologice și patologice',
    fields: [
      // TODO(doctor): confirm meaning/labels of UM / N / A / S.
      {
        key: 'intake_ap_um',
        label: 'UM',
        kind: 'text',
        pdfKey: 'ap_um',
        maxLength: 13,
        femaleOnly: true,
        hint: 'Antecedente fiziologice (doar la paciente de sex feminin).',
      },
      {
        key: 'intake_ap_n',
        label: 'N',
        kind: 'text',
        pdfKey: 'ap_n',
        maxLength: 13,
        femaleOnly: true,
        hint: 'Antecedente fiziologice (doar la paciente de sex feminin).',
      },
      {
        key: 'intake_ap_a',
        label: 'A',
        kind: 'text',
        pdfKey: 'ap_a',
        maxLength: 13,
        femaleOnly: true,
        hint: 'Antecedente fiziologice (doar la paciente de sex feminin).',
      },
      {
        key: 'intake_ap_s',
        label: 'S',
        kind: 'text',
        pdfKey: 'ap_s',
        maxLength: 13,
        femaleOnly: true,
        hint: 'Antecedente fiziologice (doar la paciente de sex feminin).',
      },
      {
        key: 'intake_neaga_patologice',
        label: 'Neagă patologice',
        kind: 'checkbox',
        pdfKey: 'neaga_patologice',
        hint: 'Bifați dacă pacientul neagă antecedente patologice.',
      },
    ],
  },
  {
    key: 'conditii',
    title: 'Condiții de viață',
    fields: [
      {
        key: 'intake_fumat',
        label: 'Fumat',
        kind: 'yesnoocaz',
        pdfKey: 'fumat_da',
        hint: 'Fumător: Da / Nu / Ocazional.',
      },
      {
        key: 'intake_tigari_zi',
        label: 'Câte țigări/zi',
        kind: 'text',
        pdfKey: 'tigari_zi',
        maxLength: 8,
        hint: 'Număr de țigări pe zi, dacă fumează.',
      },
      {
        key: 'intake_nefumeaza_ani',
        label: 'Nu fumează de (ani)',
        kind: 'text',
        pdfKey: 'nefumeaza_ani',
        maxLength: 6,
        hint: 'De câți ani nu mai fumează (fost fumător).',
      },
      {
        key: 'intake_alcool',
        label: 'Alcool',
        kind: 'yesnoocaz',
        pdfKey: 'alcool_da',
        hint: 'Consum de alcool: Da / Nu / Ocazional.',
      },
      {
        key: 'intake_cafea',
        label: 'Cafea',
        kind: 'yesnoocaz',
        pdfKey: 'cafea_da',
        hint: 'Consum de cafea: Da / Nu / Ocazional.',
      },
      {
        key: 'intake_droguri',
        label: 'Droguri',
        kind: 'yesnoocaz',
        pdfKey: 'droguri_da',
        hint: 'Consum de droguri: Da / Nu / Ocazional.',
      },
      {
        key: 'intake_energizant',
        label: 'Energizant',
        kind: 'yesnoocaz',
        pdfKey: 'energ_da',
        hint: 'Consum de energizante: Da / Nu / Ocazional.',
      },
      {
        key: 'intake_alergii',
        label: 'Alergii',
        kind: 'text',
        pdfKey: 'alergii',
        maxLength: 110,
        hint: 'Alergii cunoscute.',
      },
      {
        key: 'intake_sport_performanta',
        label: 'Sport de performanță',
        kind: 'text',
        pdfKey: 'sport_perf',
        maxLength: 97,
        hint: 'Sport de performanță practicat, dacă e cazul.',
      },
      {
        key: 'intake_tratamente_urmate',
        label: 'Tratamente urmate',
        kind: 'text',
        pdfKey: 'tratamente',
        maxLength: 99,
        hint: 'Tratamente medicamentoase urmate.',
      },
    ],
  },
  {
    key: 'profesionale',
    title: 'Boli profesionale / Accidente / Stagiu militar',
    fields: [
      {
        key: 'intake_boli_profesionale',
        label: 'Boli profesionale',
        kind: 'yesno',
        pdfKey: 'bp_da',
        hint: 'Dacă are boli profesionale diagnosticate.',
      },
      {
        key: 'intake_boli_profesionale_diagnostic',
        label: 'Dg.',
        kind: 'text',
        pdfKey: 'bp_dg',
        maxLength: 51,
        hint: 'Diagnosticul bolii profesionale.',
      },
      {
        key: 'intake_boli_profesionale_an',
        label: 'Anul',
        kind: 'text',
        pdfKey: 'bp_an',
        maxLength: 11,
        hint: 'Anul diagnosticării.',
      },
      {
        key: 'intake_accidente_munca',
        label: 'Accidente de muncă',
        kind: 'yesno',
        pdfKey: 'am_da',
        hint: 'Dacă a suferit accidente de muncă.',
      },
      {
        key: 'intake_accidente_munca_diagnostic',
        label: 'Dg.',
        kind: 'text',
        pdfKey: 'am_dg',
        maxLength: 51,
        hint: 'Diagnosticul / leziunea în urma accidentului.',
      },
      {
        key: 'intake_accidente_munca_an',
        label: 'Anul',
        kind: 'text',
        pdfKey: 'am_an',
        maxLength: 11,
        hint: 'Anul accidentului.',
      },
      {
        key: 'intake_stagiu_militar',
        label: 'Stagiul militar',
        kind: 'yesno',
        pdfKey: 'stagiu_da',
        hint: 'Dacă a efectuat stagiul militar.',
      },
    ],
  },
]

// New keys this phase adds to the anamnesis bucket (for validation whitelist).
export const DOSAR_NEW_TEXT_KEYS: Record<string, number> = {
  intake_formare_profesionala: 33,
  intake_activitati_loc_munca: 79,
  intake_ap_um: 13,
  intake_ap_n: 13,
  intake_ap_a: 13,
  intake_ap_s: 13,
  intake_tigari_zi: 8,
  intake_nefumeaza_ani: 6,
  intake_boli_profesionale_an: 11,
  intake_accidente_munca_an: 11,
}

// ─── Validation (angajare anamnesis extras) ─────────────────────────────────

function parseRuta(value: unknown): RutaRow[] | string | null {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null
  const rows: RutaRow[] = []
  for (const raw of value.slice(0, RUTA_MAX_ROWS)) {
    const r = (raw ?? {}) as Record<string, unknown>
    rows.push({
      firma: typeof r.firma === 'string' ? r.firma : '',
      post: typeof r.post === 'string' ? r.post : '',
      perioada: typeof r.perioada === 'string' ? r.perioada : '',
      functia: typeof r.functia === 'string' ? r.functia : '',
      noxa: typeof r.noxa === 'string' ? r.noxa : '',
    })
  }
  return rows
}

/**
 * Validate (and lightly sanitize) the angajare-only `intake_*` keys inside the
 * anamnesis bucket. Leaves every other anamnesis key untouched. Returns the
 * (shallow-cloned) object to store.
 */
export function validateDosarAnamnesis(
  value: object,
  issues: string[]
): Record<string, unknown> {
  const obj = { ...(value as Record<string, unknown>) }

  for (const [key, max] of Object.entries(DOSAR_NEW_TEXT_KEYS)) {
    if (!(key in obj)) continue
    const v = obj[key]
    if (v === null || v === undefined || v === '') {
      obj[key] = undefined
    } else if (typeof v !== 'string') {
      issues.push(`anamnesis.${key} must be a string`)
    } else if (v.trim().length > max) {
      issues.push(`anamnesis.${key} must be at most ${max} characters`)
    } else {
      obj[key] = v.trim()
    }
  }

  const checkEnum = (key: string, allowed: string[]) => {
    if (!(key in obj)) return
    const v = obj[key]
    if (v === null || v === '' || v === undefined) {
      obj[key] = undefined
    } else if (typeof v !== 'string' || !allowed.includes(v)) {
      issues.push(`anamnesis.${key} must be one of: ${allowed.join(', ')}`)
    }
  }
  checkEnum('intake_invaliditate', ['nu', 'da'])
  checkEnum('intake_grad_invaliditate', ['I', 'II', 'III'])
  checkEnum('intake_evidenta_itm', ['nu', 'da'])

  for (const key of ['intake_heredo_fara_importanta', 'intake_neaga_patologice']) {
    if (key in obj && obj[key] !== undefined && typeof obj[key] !== 'boolean') {
      issues.push(`anamnesis.${key} must be a boolean`)
    }
  }

  if ('intake_ruta_profesionala' in obj && obj.intake_ruta_profesionala != null) {
    const parsed = parseRuta(obj.intake_ruta_profesionala)
    if (parsed === null) {
      issues.push('anamnesis.intake_ruta_profesionala must be a string or an array of rows')
    } else if (Array.isArray(parsed)) {
      // Enforce per-cell maxLength; store the normalized rows.
      for (const row of parsed) {
        for (const col of RUTA_COLS) {
          if (row[col].trim().length > RUTA_COL_MAXLEN[col]) {
            issues.push(`anamnesis.intake_ruta_profesionala.${col} too long`)
          }
          row[col] = row[col].trim()
        }
      }
      obj.intake_ruta_profesionala = parsed
    }
  }

  return obj
}

// ─── PDF field builder ──────────────────────────────────────────────────────

export interface DosarFieldInput {
  anamnesis: Record<string, unknown>
  companyName: string
  workplaceName: string
  department: string
  companyAddress: string
  lastName: string
  firstName: string
  varsta: string
  dataNasterii: string
  cnp: string
  employeeAddress: string
  phone: string
  jobTitle: string
  gender: string | null
  disabilityDegree: string | null
  medicCurantName: string | null
  familyHistory: string
  allergies: string
}

export function buildDosarFields(input: DosarFieldInput): Record<string, string | boolean> {
  const a = input.anamnesis
  const fields: Record<string, string | boolean> = {}
  const oneLine = (v: unknown) =>
    (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim()
  const put = (key: string, v: unknown) => {
    const s = oneLine(v)
    if (s) fields[key] = s
  }
  const yesNo = (val: string, nuKey: string, daKey: string, ocazKey?: string) => {
    if (val === 'nu') fields[nuKey] = true
    else if (val === 'da') fields[daKey] = true
    else if (val === 'ocazional' && ocazKey) fields[ocazKey] = true
  }
  const str = (key: string) => oneLine(a[key])

  // Identity / record
  put('unitate', input.companyName)
  put('punct_lucru', input.workplaceName)
  put('sectia', input.department)
  put('adresa_unitate', input.companyAddress)
  put('nume', input.lastName)
  put('prenume', input.firstName)
  put('varsta', input.varsta)
  put('data_nasterii', input.dataNasterii)
  put('cnp', input.cnp)
  put('adresa_pacient', input.employeeAddress)
  put('telefon', input.phone)
  put('ocupatia', input.jobTitle)
  put('medic_familie', str('intake_medic_familie') || oneLine(input.medicCurantName))
  // Handicap: no disabilityDegree on file → "nu".
  if (input.disabilityDegree) fields.handicap_da = true
  else fields.handicap_nu = true

  // New intake text fields
  put('formare', str('intake_formare_profesionala'))
  put('activitati_loc_munca', str('intake_activitati_loc_munca'))

  // Ruta profesională (array → rows; legacy string → row 1 firma, truncated)
  const ruta = parseRuta(a.intake_ruta_profesionala)
  if (Array.isArray(ruta)) {
    ruta.slice(0, RUTA_MAX_ROWS).forEach((row, i) => {
      const r = i + 1
      for (const col of RUTA_COLS) put(`ruta_${r}_${col}`, row[col])
    })
  } else if (typeof ruta === 'string' && ruta.trim()) {
    fields.ruta_1_firma = oneLine(ruta).slice(0, RUTA_COL_MAXLEN.firma)
  }

  // Declarații
  yesNo(str('intake_invaliditate'), 'invalid_nu', 'invalid_da')
  if (str('intake_invaliditate') === 'da') put('grad_inv', str('intake_grad_invaliditate'))
  yesNo(str('intake_evidenta_itm'), 'itm_nu', 'itm_da')

  // Antecedente heredo-colaterale
  put('antec_heredo', input.familyHistory)
  if (a.intake_heredo_fara_importanta === true) fields.heredo_fara_imp = true

  // Antecedente personale (F only)
  if (input.gender === 'F') {
    put('ap_um', str('intake_ap_um'))
    put('ap_n', str('intake_ap_n'))
    put('ap_a', str('intake_ap_a'))
    put('ap_s', str('intake_ap_s'))
  }
  if (a.intake_neaga_patologice === true) fields.neaga_patologice = true
  // ap_recomandari — TODO(doctor): confirm what she writes here; map nothing yet.

  // Condiții de viață
  yesNo(str('intake_fumat'), 'fumat_nu', 'fumat_da', 'fumat_ocaz')
  put('tigari_zi', str('intake_tigari_zi'))
  put('nefumeaza_ani', str('intake_nefumeaza_ani'))
  yesNo(str('intake_alcool'), 'alcool_nu', 'alcool_da', 'alcool_ocaz')
  yesNo(str('intake_cafea'), 'cafea_nu', 'cafea_da', 'cafea_ocaz')
  yesNo(str('intake_droguri'), 'droguri_nu', 'droguri_da', 'droguri_ocaz')
  yesNo(str('intake_energizant'), 'energ_nu', 'energ_da', 'energ_ocaz')
  put('alergii', str('intake_alergii') || oneLine(input.allergies))
  put('sport_perf', str('intake_sport_performanta'))
  put('tratamente', str('intake_tratamente_urmate'))

  // Boli profesionale / accidente / stagiu
  yesNo(str('intake_boli_profesionale'), 'bp_nu', 'bp_da')
  put('bp_dg', str('intake_boli_profesionale_diagnostic'))
  put('bp_an', str('intake_boli_profesionale_an'))
  yesNo(str('intake_accidente_munca'), 'am_nu', 'am_da')
  put('am_dg', str('intake_accidente_munca_diagnostic'))
  put('am_an', str('intake_accidente_munca_an'))
  yesNo(str('intake_stagiu_militar'), 'stagiu_nu', 'stagiu_da')

  return fields
}

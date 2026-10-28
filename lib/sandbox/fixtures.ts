/**
 * The one deterministic fake dataset behind the whole sandbox.
 *
 * `buildFixtures(now)` is pure and seeded: same `now` → same data, every
 * time, on server and client. Dates are computed relative to `now` so the
 * demo always looks "current" (today has appointments, some recalls are
 * overdue, etc.). All names / CUIs / CNPs are obviously fictional.
 *
 * Isolation: this module imports nothing from the backend. It is the single
 * source of truth for every sandbox phase (dashboard, examinations, reports,
 * Iris).
 */

import { buildNormalClinicalExam } from './clinical'
import { fakeId, Rng } from './rng'
import type {
  ExaminationTypeCode,
  ExaminationVerdict,
  SandboxCompany,
  SandboxData,
  SandboxEmployee,
  SandboxExamination,
  SandboxExaminationType,
  SandboxHazard,
  SandboxRecall,
  SandboxWorkplace,
} from './types'

const DAY = 86_400_000

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY)
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}
function atTime(day: Date, h: number, m: number): Date {
  const x = new Date(day)
  x.setHours(h, m, 0, 0)
  return x
}

// ── Reference data ──────────────────────────────────────────────────────────

const EXAMINATION_TYPES: SandboxExaminationType[] = [
  {
    id: fakeId('extype01', 1),
    code: 'angajare',
    nameRo: 'Examen medical la angajare',
    nameEn: 'Pre-employment medical examination',
    defaultValidityMonths: 12,
    sortOrder: 1,
  },
  {
    id: fakeId('extype02', 2),
    code: 'control_periodic',
    nameRo: 'Control medical periodic',
    nameEn: 'Periodic medical check-up',
    defaultValidityMonths: 12,
    sortOrder: 2,
  },
  {
    id: fakeId('extype03', 3),
    code: 'adaptare',
    nameRo: 'Examen de adaptare',
    nameEn: 'Adaptation examination',
    defaultValidityMonths: 12,
    sortOrder: 3,
  },
  {
    id: fakeId('extype04', 4),
    code: 'reluare_munca',
    nameRo: 'Examen la reluarea activității',
    nameEn: 'Return-to-work examination',
    defaultValidityMonths: 12,
    sortOrder: 4,
  },
  {
    id: fakeId('extype05', 5),
    code: 'supraveghere_speciala',
    nameRo: 'Supraveghere medicală specială',
    nameEn: 'Special medical surveillance',
    defaultValidityMonths: 6,
    sortOrder: 5,
  },
]

function hz(key: string, label: string): SandboxHazard {
  return { key, label }
}

/**
 * Map a fixture hazard key to the real RiskProfile location
 * (category → hazard key) + a severity, so the reused risk-profile components
 * and reports read a genuine profile. Hazards with no real-schema equivalent
 * (e.g. work at height, road traffic) are kept in `hazards` for Iris but omitted
 * from the structured profile.
 */
const HAZARD_TO_RISK: Record<
  string,
  { category: string; key: string; severity: 'low' | 'medium' | 'high' }
> = {
  zgomot: { category: 'physical', key: 'noise', severity: 'high' },
  vibratii: { category: 'physical', key: 'vibrations', severity: 'medium' },
  pulberi: { category: 'chemical', key: 'dust', severity: 'medium' },
  sudura: { category: 'chemical', key: 'fumes', severity: 'high' },
  efort_fizic: { category: 'ergonomic', key: 'manualHandling', severity: 'medium' },
  manipulare: { category: 'ergonomic', key: 'manualHandling', severity: 'medium' },
  videoterminale: { category: 'ergonomic', key: 'screenWork', severity: 'low' },
  pozitie_sezand: { category: 'ergonomic', key: 'awkwardPostures', severity: 'low' },
  frig: { category: 'physical', key: 'extremeTemperatures', severity: 'medium' },
  biologic: { category: 'biological', key: 'bacteria', severity: 'high' },
  chimic: { category: 'chemical', key: 'solvents', severity: 'high' },
  spatii_inchise: { category: 'psychosocial', key: 'isolatedWork', severity: 'medium' },
}

function buildRiskProfile(hazards: SandboxHazard[]): Record<string, unknown> {
  const profile: Record<string, Record<string, unknown>> = {}
  for (const h of hazards) {
    const m = HAZARD_TO_RISK[h.key]
    if (!m) continue
    if (!profile[m.category]) profile[m.category] = {}
    profile[m.category][m.key] = { present: true, severity: m.severity }
  }
  return profile
}

const HAZARDS = {
  zgomot: hz('zgomot', 'Zgomot profesional'),
  vibratii: hz('vibratii', 'Vibrații mecanice'),
  pulberi: hz('pulberi', 'Pulberi industriale'),
  sudura: hz('sudura', 'Fum de sudură'),
  efortFizic: hz('efort_fizic', 'Efort fizic mare'),
  inaltime: hz('inaltime', 'Lucru la înălțime'),
  manipulare: hz('manipulare', 'Manipulare manuală a maselor'),
  videoterminale: hz('videoterminale', 'Videoterminale (PVE)'),
  pozitieSezand: hz('pozitie_sezand', 'Poziție șezândă prelungită'),
  frig: hz('frig', 'Temperaturi scăzute'),
  biologic: hz('biologic', 'Agenți biologici'),
  chimic: hz('chimic', 'Substanțe chimice periculoase'),
  spatiiInchise: hz('spatii_inchise', 'Spații închise'),
  trafic: hz('trafic', 'Trafic rutier'),
} as const

// ── Companies (6, fixed) ──────────────────────────────────────────────────

interface CompanySpec {
  name: string
  cui: string
  city: string
  county: string
  caenCode: string
  industry: string
  employeeTarget: number
  workplaces: { name: string; department: string | null; hazards: SandboxHazard[] }[]
  /** realistic job titles for this industry */
  jobs: string[]
}

const COMPANY_SPECS: CompanySpec[] = [
  {
    name: 'Metalconstruct Demo SRL',
    cui: 'RO90000001',
    city: 'Cluj-Napoca',
    county: 'Cluj',
    caenCode: '2511',
    industry: 'Construcții metalice',
    employeeTarget: 28,
    workplaces: [
      {
        name: 'Hală sudură',
        department: 'Producție',
        hazards: [HAZARDS.sudura, HAZARDS.zgomot, HAZARDS.pulberi],
      },
      {
        name: 'Debitare & prelucrare',
        department: 'Producție',
        hazards: [HAZARDS.zgomot, HAZARDS.vibratii, HAZARDS.pulberi],
      },
      { name: 'Vopsitorie', department: 'Finisaje', hazards: [HAZARDS.chimic, HAZARDS.pulberi] },
      {
        name: 'Birouri tehnice',
        department: 'Administrativ',
        hazards: [HAZARDS.videoterminale, HAZARDS.pozitieSezand],
      },
    ],
    jobs: [
      'Sudor',
      'Operator debitare',
      'Lăcătuș mecanic',
      'Vopsitor industrial',
      'Inginer proiectant',
      'Șef tură',
    ],
  },
  {
    name: 'TransLogistica Demo SA',
    cui: 'RO90000002',
    city: 'Cluj-Napoca',
    county: 'Cluj',
    caenCode: '4941',
    industry: 'Transport & logistică',
    employeeTarget: 24,
    workplaces: [
      {
        name: 'Depozit central',
        department: 'Logistică',
        hazards: [HAZARDS.manipulare, HAZARDS.efortFizic],
      },
      { name: 'Parc auto', department: 'Transport', hazards: [HAZARDS.trafic, HAZARDS.vibratii] },
      {
        name: 'Dispecerat',
        department: 'Administrativ',
        hazards: [HAZARDS.videoterminale, HAZARDS.pozitieSezand],
      },
    ],
    jobs: [
      'Șofer profesionist',
      'Manipulant mărfuri',
      'Stivuitorist',
      'Dispecer',
      'Gestionar depozit',
    ],
  },
  {
    name: 'Construct Alpin Demo SRL',
    cui: 'RO90000003',
    city: 'Brașov',
    county: 'Brașov',
    caenCode: '4120',
    industry: 'Construcții civile',
    employeeTarget: 22,
    workplaces: [
      {
        name: 'Șantier rezidențial Nord',
        department: 'Execuție',
        hazards: [HAZARDS.inaltime, HAZARDS.zgomot, HAZARDS.pulberi, HAZARDS.efortFizic],
      },
      {
        name: 'Șantier infrastructură',
        department: 'Execuție',
        hazards: [HAZARDS.inaltime, HAZARDS.vibratii, HAZARDS.efortFizic],
      },
      { name: 'Sediu & logistică', department: 'Administrativ', hazards: [HAZARDS.videoterminale] },
    ],
    jobs: [
      'Zidar',
      'Dulgher',
      'Fierar betonist',
      'Macaragiu',
      'Șef șantier',
      'Inginer construcții',
    ],
  },
  {
    name: 'NordOffice IT Demo SRL',
    cui: 'RO90000004',
    city: 'București',
    county: 'București',
    caenCode: '6201',
    industry: 'Servicii IT',
    employeeTarget: 16,
    workplaces: [
      {
        name: 'Open space etaj 3',
        department: 'Dezvoltare',
        hazards: [HAZARDS.videoterminale, HAZARDS.pozitieSezand],
      },
      {
        name: 'Open space etaj 4',
        department: 'Suport',
        hazards: [HAZARDS.videoterminale, HAZARDS.pozitieSezand],
      },
    ],
    jobs: ['Programator', 'Analist', 'Consultant suport', 'Manager proiect', 'Specialist HR'],
  },
  {
    name: 'Panificația Aurora Demo SRL',
    cui: 'RO90000005',
    city: 'Turda',
    county: 'Cluj',
    caenCode: '1071',
    industry: 'Industrie alimentară',
    employeeTarget: 18,
    workplaces: [
      {
        name: 'Linie panificație',
        department: 'Producție',
        hazards: [HAZARDS.efortFizic, HAZARDS.pulberi, HAZARDS.biologic],
      },
      { name: 'Camere frig', department: 'Depozitare', hazards: [HAZARDS.frig, HAZARDS.biologic] },
      {
        name: 'Ambalare & livrare',
        department: 'Expediție',
        hazards: [HAZARDS.manipulare, HAZARDS.efortFizic],
      },
    ],
    jobs: ['Brutar', 'Patiser', 'Operator ambalare', 'Manipulant depozit frig', 'Șofer livrări'],
  },
  {
    name: 'AquaServ Demo SA',
    cui: 'RO90000006',
    city: 'Dej',
    county: 'Cluj',
    caenCode: '3600',
    industry: 'Utilități apă-canal',
    employeeTarget: 14,
    workplaces: [
      {
        name: 'Stație tratare apă',
        department: 'Operare',
        hazards: [HAZARDS.chimic, HAZARDS.biologic, HAZARDS.zgomot],
      },
      {
        name: 'Rețea & intervenții',
        department: 'Mentenanță',
        hazards: [HAZARDS.spatiiInchise, HAZARDS.biologic, HAZARDS.efortFizic],
      },
    ],
    jobs: ['Operator stație tratare', 'Instalator rețea', 'Laborant', 'Electromecanic', 'Dispecer'],
  },
]

// ── Name pools (obviously Romanian, deterministic) ────────────────────────

const FIRST_M = [
  'Andrei',
  'Mihai',
  'Cristian',
  'Ionuț',
  'Vlad',
  'Gabriel',
  'Alexandru',
  'Florin',
  'Radu',
  'Bogdan',
  'Daniel',
  'Marius',
  'Sorin',
  'Ovidiu',
  'Adrian',
  'Cătălin',
  'Nicolae',
  'Dragoș',
]
const FIRST_F = [
  'Elena',
  'Ioana',
  'Maria',
  'Andreea',
  'Raluca',
  'Gabriela',
  'Simona',
  'Daniela',
  'Cristina',
  'Alina',
  'Mihaela',
  'Roxana',
  'Carmen',
  'Diana',
  'Oana',
  'Georgiana',
  'Larisa',
]
const LAST = [
  'Popescu',
  'Ionescu',
  'Dumitrescu',
  'Stan',
  'Gheorghe',
  'Constantin',
  'Marin',
  'Munteanu',
  'Stoica',
  'Dobre',
  'Barbu',
  'Nistor',
  'Florea',
  'Tudor',
  'Lungu',
  'Ciobanu',
  'Rusu',
  'Matei',
  'Oprea',
  'Pavel',
  'Sandu',
  'Nagy',
  'Pop',
  'Kovacs',
]

const APT_CONDITIONS = [
  'Purtarea obligatorie a antifoanelor în zonele cu zgomot.',
  'Evitarea ridicării manuale a maselor peste 15 kg.',
  'Control oftalmologic de specialitate la 6 luni.',
  'Fără lucru la înălțime până la reevaluare.',
  'Pauze vizuale la 50 de minute de lucru la videoterminal.',
  'Monitorizarea tensiunii arteriale lunar.',
]

function fakeCnp(rng: Rng, gender: 'M' | 'F', birth: Date): string {
  // Fictional CNP-shaped string. First digit encodes century/sex per the real
  // format (1/2 for 1900s M/F) but the rest is random — not a valid CNP.
  const s = gender === 'M' ? '1' : '2'
  const yy = String(birth.getFullYear() % 100).padStart(2, '0')
  const mm = String(birth.getMonth() + 1).padStart(2, '0')
  const dd = String(birth.getDate()).padStart(2, '0')
  let rest = ''
  for (let i = 0; i < 6; i++) rest += String(rng.int(0, 9))
  return `${s}${yy}${mm}${dd}${rest}`
}

// ── Builder ────────────────────────────────────────────────────────────────

export function buildFixtures(now: Date = new Date()): SandboxData {
  const rng = new Rng(0x5a4d2b11)
  const today = startOfDay(now)

  const practitioner = {
    id: fakeId('practnr1', 1),
    firstName: 'Ana',
    lastName: 'Demo',
    displayName: 'Dr. Ana Demo',
  }
  const cabinetName = 'Cabinet Demo'

  const typeByCode = new Map<ExaminationTypeCode, SandboxExaminationType>(
    EXAMINATION_TYPES.map((t) => [t.code, t])
  )

  // Companies + workplaces
  const companies: SandboxCompany[] = []
  const workplaces: SandboxWorkplace[] = []
  let cIdx = 0
  let wIdx = 0
  for (const spec of COMPANY_SPECS) {
    const companyId = fakeId('company0', ++cIdx)
    companies.push({
      id: companyId,
      name: spec.name,
      cui: spec.cui,
      city: spec.city,
      county: spec.county,
      caenCode: spec.caenCode,
      industry: spec.industry,
      isActive: true,
      createdAt: addMonths(today, -rng.int(14, 30)),
    })
    for (const w of spec.workplaces) {
      workplaces.push({
        id: fakeId('worpl000', ++wIdx),
        companyId,
        name: w.name,
        department: w.department,
        hazards: w.hazards,
        riskProfile: buildRiskProfile(w.hazards),
        examinationIntervalMonths: 12,
        isActive: true,
      })
    }
  }

  const workplacesByCompany = new Map<string, SandboxWorkplace[]>()
  for (const w of workplaces) {
    const arr = workplacesByCompany.get(w.companyId) ?? []
    arr.push(w)
    workplacesByCompany.set(w.companyId, arr)
  }

  // Employees
  const employees: SandboxEmployee[] = []
  let eIdx = 0
  let noWorkplaceLeft = 4
  let noCnpLeft = 6
  let noJobLeft = 5
  let archivedLeft = 6

  COMPANY_SPECS.forEach((spec, specIndex) => {
    const company = companies[specIndex]
    const wps = workplacesByCompany.get(company.id) ?? []
    for (let i = 0; i < spec.employeeTarget; i++) {
      const gender: 'M' | 'F' = rng.chance(0.62) ? 'M' : 'F'
      const firstName = gender === 'M' ? rng.pick(FIRST_M) : rng.pick(FIRST_F)
      const lastName = rng.pick(LAST)
      const birthDate = addDays(today, -rng.int(21, 60) * 365 - rng.int(0, 364))

      const withoutWorkplace = noWorkplaceLeft > 0 && rng.chance(0.03)
      if (withoutWorkplace) noWorkplaceLeft--
      const workplace = withoutWorkplace ? null : rng.pick(wps)

      const missingJob = noJobLeft > 0 && rng.chance(0.04)
      if (missingJob) noJobLeft--

      const missingCnp = noCnpLeft > 0 && rng.chance(0.05)
      if (missingCnp) noCnpLeft--

      const archived = archivedLeft > 0 && rng.chance(0.05)
      if (archived) archivedLeft--

      employees.push({
        id: fakeId('employe', ++eIdx),
        companyId: company.id,
        workplaceId: workplace?.id ?? null,
        firstName,
        lastName,
        jobTitle: missingJob ? null : rng.pick(spec.jobs),
        cnp: missingCnp ? null : fakeCnp(rng, gender, birthDate),
        birthDate,
        gender,
        phone: `+40 7${rng.int(20, 59)} ${rng.int(100, 999)} ${rng.int(100, 999)}`,
        email: rng.chance(0.5)
          ? `${firstName}.${lastName}@example.ro`.toLowerCase().replace(/[^a-z.@]/g, '')
          : null,
        archivedAt: archived ? addMonths(today, -rng.int(1, 10)) : null,
        createdAt: addMonths(today, -rng.int(2, 24)),
      })
    }
  })

  const activeEmployees = employees.filter((e) => e.archivedAt === null && e.workplaceId !== null)

  // ── Examinations ─────────────────────────────────────────────────────────
  const examinations: SandboxExamination[] = []
  const sequenceByYear = new Map<number, number>()
  function nextNumber(year: number): { number: string; sequence: number } {
    const seq = (sequenceByYear.get(year) ?? 0) + 1
    sequenceByYear.set(year, seq)
    return { number: `${year}/${String(seq).padStart(4, '0')}`, sequence: seq }
  }

  const TYPE_CODES: ExaminationTypeCode[] = [
    'control_periodic',
    'angajare',
    'adaptare',
    'reluare_munca',
    'supraveghere_speciala',
  ]
  const TYPE_WEIGHTS = [62, 18, 7, 8, 5]

  function pickVerdict(): { verdict: ExaminationVerdict; conditions: string | null } {
    const v = rng.weighted<ExaminationVerdict>(
      ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'],
      [85, 10, 4, 1]
    )
    return {
      verdict: v,
      conditions: v === 'apt_conditionat' ? rng.pick(APT_CONDITIONS) : null,
    }
  }

  let examIdx = 0
  function makeExam(params: {
    employee: SandboxEmployee
    code: ExaminationTypeCode
    completedAt: Date
    status?: 'completed'
    signed?: boolean
  }): SandboxExamination {
    const { employee, code, completedAt } = params
    const type = typeByCode.get(code)!
    const wpId = employee.workplaceId!
    const year = completedAt.getFullYear()
    const { number, sequence } = nextNumber(year)
    const { verdict, conditions } = pickVerdict()
    const signed = params.signed ?? true
    const periodic = code === 'control_periodic' || code === 'supraveghere_speciala'
    const started = new Date(completedAt.getTime() - rng.int(25, 55) * 60_000)

    // Plausible vitals for a working-age adult.
    const height = rng.int(158, 192)
    const weight = rng.int(55, 102)
    const bmi = Math.round((weight / ((height / 100) * (height / 100))) * 10) / 10
    const vitalSigns = {
      height,
      weight,
      bmi,
      bpSystolic: rng.int(108, 142),
      bpDiastolic: rng.int(66, 92),
      pulse: rng.int(58, 88),
    }
    const supplementary = rng
      .shuffle(['oftalmo', 'ekg', 'glicemie', 'hemo', 'sumar', 'audio'])
      .slice(0, periodic ? rng.int(3, 5) : 0)

    return {
      id: fakeId('examinn', ++examIdx),
      employeeId: employee.id,
      companyId: employee.companyId!,
      workplaceId: wpId,
      examinationTypeId: type.id,
      examinationTypeCode: code,
      examinationNumber: number,
      examinationYear: year,
      examinationSequence: sequence,
      status: 'completed',
      scheduledAt: atTime(startOfDay(completedAt), 8 + rng.int(0, 8), rng.pick([0, 15, 30, 45])),
      startedAt: started,
      completedAt,
      examinedAt: completedAt,
      signedAt: signed ? new Date(completedAt.getTime() + rng.int(5, 90) * 60_000) : null,
      createdAt: started,
      verdict,
      verdictConditions: conditions,
      inaptTemporarUntil: verdict === 'inapt_temporar' ? addMonths(completedAt, 3) : null,
      nextExaminationDueDate: addMonths(startOfDay(completedAt), type.defaultValidityMonths),
      currentStep: null,
      anamnesis: {},
      vitalSigns,
      visionTest: periodic ? { leftEye: '1.0', rightEye: '1.0' } : {},
      hearingTest: {},
      lungFunction: {},
      additionalTests: periodic ? { ordered: supplementary } : {},
      maternityRisk: {},
      clinicalExam: periodic ? buildNormalClinicalExam() : {},
      diagnoses: [],
      clinicalFindings:
        verdict === 'apt'
          ? 'Clinic sănătos. Fără modificări patologice decelabile.'
          : 'Modificări minore, fără impact asupra aptitudinii.',
      recommendations: conditions ?? 'Reexaminare la termen.',
      notes: '',
      revokedAt: null,
      revocationReason: null,
      supersededByExaminationId: null,
    }
  }

  // Historical exams: walk back 12 months. Each active employee gets 1–3
  // completed exams in the window (≈250 total with today's agenda added).
  for (const employee of activeEmployees) {
    const count = rng.weighted([1, 2, 3], [28, 40, 32])
    for (let k = 0; k < count; k++) {
      const code = rng.weighted(TYPE_CODES, TYPE_WEIGHTS)
      // spread across the last 12 months, newest first
      const monthsBack = rng.int(1, 12)
      const completedAt = atTime(
        addDays(addMonths(today, -monthsBack), rng.int(-10, 10)),
        9 + rng.int(0, 6),
        rng.pick([0, 15, 30, 45])
      )
      // a few recent completed exams stay unsigned (dashboard "unsigned" alert)
      const signed = !(monthsBack <= 1 && examinations.length % 37 === 0)
      examinations.push(makeExam({ employee, code, completedAt, signed }))
    }
  }

  // Guarantee exactly ~4 unsigned-completed exams for a predictable alert.
  const unsignedTarget = 4
  let unsigned = examinations.filter((e) => e.status === 'completed' && e.signedAt === null).length
  for (const e of examinations) {
    if (unsigned >= unsignedTarget) break
    if (
      e.signedAt !== null &&
      e.completedAt &&
      e.completedAt.getTime() > addMonths(today, -2).getTime()
    ) {
      e.signedAt = null
      unsigned++
    }
  }
  // If we overshot, re-sign the extras.
  for (const e of examinations) {
    if (unsigned <= unsignedTarget) break
    if (e.signedAt === null && e.completedAt) {
      e.signedAt = new Date(e.completedAt.getTime() + 30 * 60_000)
      unsigned--
    }
  }

  // One revoked fișă with a replacement.
  const revokedBase = examinations.find((e) => e.verdict === 'apt' && e.signedAt !== null)
  if (revokedBase) {
    const replEmp = employees.find((e) => e.id === revokedBase.employeeId)!
    const replacement = makeExam({
      employee: replEmp,
      code: revokedBase.examinationTypeCode,
      completedAt: addDays(revokedBase.completedAt!, 20),
      signed: true,
    })
    examinations.push(replacement)
    revokedBase.revokedAt = addDays(revokedBase.completedAt!, 18)
    revokedBase.revocationReason = 'Eroare de transcriere a verdictului; reemisă cu fișa corectată.'
    revokedBase.supersededByExaminationId = replacement.id
  }

  // ── Today's agenda ─────────────────────────────────────────────────────
  // 6 scheduled (5 periodic/various + 1 angajare) + 1 in-progress "hero".
  const todayEmployees = rng.shuffle(activeEmployees).slice(0, 7)

  const heroEmp = todayEmployees[0]
  const heroType = typeByCode.get('control_periodic')!
  const heroYear = today.getFullYear()
  const heroNum = nextNumber(heroYear)
  const heroExam: SandboxExamination = {
    id: fakeId('heroexam', 1),
    employeeId: heroEmp.id,
    companyId: heroEmp.companyId!,
    workplaceId: heroEmp.workplaceId!,
    examinationTypeId: heroType.id,
    examinationTypeCode: 'control_periodic',
    examinationNumber: heroNum.number,
    examinationYear: heroYear,
    examinationSequence: heroNum.sequence,
    status: 'in_progress',
    scheduledAt: atTime(today, 9, 0),
    startedAt: atTime(today, 9, 5),
    completedAt: null,
    examinedAt: null,
    signedAt: null,
    createdAt: atTime(today, 8, 50),
    verdict: null,
    verdictConditions: null,
    inaptTemporarUntil: null,
    nextExaminationDueDate: null,
    currentStep: 2,
    anamnesis: {},
    vitalSigns: { height: 178, weight: 82, bmi: 25.9, bpSystolic: 128, bpDiastolic: 80, pulse: 72 },
    visionTest: {},
    hearingTest: {},
    lungFunction: {},
    additionalTests: {},
    maternityRisk: {},
    clinicalExam: {},
    diagnoses: [],
    clinicalFindings: '',
    recommendations: '',
    notes: '',
    revokedAt: null,
    revocationReason: null,
    supersededByExaminationId: null,
  }
  examinations.push(heroExam)

  // 5 scheduled at staggered times + 1 angajare scheduled.
  const scheduledTimes: [number, number][] = [
    [10, 0],
    [10, 30],
    [11, 15],
    [13, 0],
    [14, 30],
    [15, 45],
  ]
  const scheduledCodes: ExaminationTypeCode[] = [
    'control_periodic',
    'control_periodic',
    'adaptare',
    'reluare_munca',
    'control_periodic',
    'angajare',
  ]
  for (let i = 0; i < 6; i++) {
    const emp = todayEmployees[i + 1]
    const code = scheduledCodes[i]
    const type = typeByCode.get(code)!
    const n = nextNumber(today.getFullYear())
    examinations.push({
      id: fakeId('todaysc', i + 1),
      employeeId: emp.id,
      companyId: emp.companyId!,
      workplaceId: emp.workplaceId!,
      examinationTypeId: type.id,
      examinationTypeCode: code,
      examinationNumber: n.number,
      examinationYear: today.getFullYear(),
      examinationSequence: n.sequence,
      status: 'scheduled',
      scheduledAt: atTime(today, scheduledTimes[i][0], scheduledTimes[i][1]),
      startedAt: null,
      completedAt: null,
      examinedAt: null,
      signedAt: null,
      createdAt: addDays(today, -rng.int(2, 10)),
      verdict: null,
      verdictConditions: null,
      inaptTemporarUntil: null,
      nextExaminationDueDate: null,
      currentStep: null,
      anamnesis: {},
      vitalSigns: {},
      visionTest: {},
      hearingTest: {},
      lungFunction: {},
      additionalTests: {},
      maternityRisk: {},
      clinicalExam: {},
      diagnoses: [],
      clinicalFindings: '',
      recommendations: '',
      notes: '',
      revokedAt: null,
      revocationReason: null,
      supersededByExaminationId: null,
    })
  }

  // ── Recalls ────────────────────────────────────────────────────────────
  // Controlled buckets so the dashboard numbers are predictable:
  //   10 overdue, 20 due within 30 days (≈6 of them within 7 days), rest later.
  const recalls: SandboxRecall[] = []
  const recallEmployees = rng.shuffle(activeEmployees)
  let rIdx = 0
  function makeRecall(
    emp: SandboxEmployee,
    dueDate: Date,
    status: SandboxRecall['status']
  ): SandboxRecall {
    const code: ExaminationTypeCode = 'control_periodic'
    return {
      id: fakeId('recall0', ++rIdx),
      employeeId: emp.id,
      companyId: emp.companyId!,
      workplaceId: emp.workplaceId!,
      examinationTypeId: typeByCode.get(code)!.id,
      examinationTypeCode: code,
      dueDate,
      status,
      createdFromExaminationId: null,
    }
  }

  let cursor = 0
  // 10 overdue
  for (let i = 0; i < 10 && cursor < recallEmployees.length; i++, cursor++) {
    recalls.push(makeRecall(recallEmployees[cursor], addDays(today, -rng.int(2, 55)), 'overdue'))
  }
  // 6 within the next 7 days
  for (let i = 0; i < 6 && cursor < recallEmployees.length; i++, cursor++) {
    recalls.push(
      makeRecall(
        recallEmployees[cursor],
        addDays(today, rng.int(0, 7)),
        rng.chance(0.3) ? 'scheduled' : 'pending'
      )
    )
  }
  // 14 more within 8–30 days
  for (let i = 0; i < 14 && cursor < recallEmployees.length; i++, cursor++) {
    recalls.push(
      makeRecall(
        recallEmployees[cursor],
        addDays(today, rng.int(8, 30)),
        rng.chance(0.25) ? 'scheduled' : 'pending'
      )
    )
  }
  // the rest: 31–330 days out
  for (; cursor < recallEmployees.length; cursor++) {
    recalls.push(makeRecall(recallEmployees[cursor], addDays(today, rng.int(31, 330)), 'pending'))
  }

  return {
    now,
    practitioner,
    cabinetName,
    examinationTypes: EXAMINATION_TYPES,
    companies,
    workplaces,
    employees,
    examinations,
    recalls,
    heroExaminationId: heroExam.id,
  }
}

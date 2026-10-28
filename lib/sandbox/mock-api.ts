/**
 * In-memory replacement for the backend inside the sandbox.
 *
 * The sandbox layout installs a `window.fetch` wrapper (see store.tsx) that
 * routes every `/api/**` request here instead of to the network. Handlers read
 * and mutate the in-memory store via `ctx`; anything unmatched falls through to
 * `{ error: 'sandbox' }` with status 200. The request NEVER reaches the
 * network.
 *
 * This module imports nothing from the backend.
 */

import type { SandboxData, SandboxExamination } from './types'

export interface MockContext {
  /** current, mutable sandbox dataset */
  data: SandboxData
  /** apply a mutation and notify React subscribers */
  mutate: (fn: (draft: SandboxData) => void) => void
}

export interface MockResult {
  status: number
  /** JSON-serializable body */
  body: unknown
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    const v = JSON.parse(init.body)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const CLINICAL_BUCKETS = [
  'anamnesis',
  'vitalSigns',
  'visionTest',
  'hearingTest',
  'lungFunction',
  'additionalTests',
  'maternityRisk',
  'clinicalExam',
] as const

function newId(prefix: string): string {
  const rand = Math.random().toString(16).slice(2, 14).padStart(12, '0')
  return `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${rand}`
}

/**
 * Resolve an intercepted `/api/**` request against the in-memory store.
 * Returns `undefined` to fall through to the generic `{ error: 'sandbox' }`
 * response. Never performs a network request.
 */
export function handleApi(
  url: URL,
  init: RequestInit | undefined,
  ctx: MockContext
): MockResult | undefined {
  const path = url.pathname
  const method = (init?.method ?? 'GET').toUpperCase()

  // ── AI side panels (canned, matched to the exam's hazards) ───────────────
  if (path === '/api/ai/examination-summary' && method === 'POST') {
    const body = parseBody(init)
    return { status: 200, body: examinationSummary(ctx.data, String(body.employeeId ?? '')) }
  }
  if (path === '/api/ai/investigation-suggestions' && method === 'POST') {
    const body = parseBody(init)
    return {
      status: 200,
      body: investigationSuggestions(ctx.data, String(body.examinationId ?? '')),
    }
  }
  if (path === '/api/ai/examination-prefill' && method === 'POST') {
    // No prefill in the demo — the doctor fills the sheet (or uses „Toate
    // aparatele în limite normale"). Empty suggestions = banner never shows.
    return { status: 200, body: { suggestions: {} } }
  }

  // ── Examination create ───────────────────────────────────────────────────
  if (path === '/api/examinations' && method === 'POST') {
    return createExamination(ctx, parseBody(init))
  }

  // ── Single-examination actions ───────────────────────────────────────────
  const examMatch = path.match(/^\/api\/examinations\/([^/]+)(\/[a-z_]+)?$/)
  if (examMatch) {
    const id = examMatch[1]
    const action = examMatch[2] ?? ''
    const exam = ctx.data.examinations.find((e) => e.id === id)
    if (!exam) return { status: 404, body: { error: 'not_found' } }

    if (action === '' && method === 'PATCH') {
      return saveExamination(ctx, id, parseBody(init))
    }
    if (action === '/start' && method === 'POST') {
      ctx.mutate((d) => {
        const e = d.examinations.find((x) => x.id === id)
        if (e && e.status === 'scheduled') {
          e.status = 'in_progress'
          e.startedAt = new Date()
        }
      })
      return { status: 200, body: { examination: { id } } }
    }
    if (action === '/sign' && method === 'POST') {
      ctx.mutate((d) => {
        const e = d.examinations.find((x) => x.id === id)
        if (e) {
          const now = new Date()
          e.status = 'completed'
          if (!e.completedAt) e.completedAt = now
          if (!e.examinedAt) e.examinedAt = now
          e.signedAt = now
        }
      })
      return { status: 200, body: { examination: { id } } }
    }
    if (action === '/cancel' && method === 'POST') {
      const reason = String(parseBody(init).reason ?? 'cancelled')
      ctx.mutate((d) => {
        const e = d.examinations.find((x) => x.id === id)
        if (e) e.status = reason === 'no_show' ? 'no_show' : 'cancelled'
      })
      return { status: 200, body: { examination: { id } } }
    }
    if (action === '/revoke' && method === 'POST') {
      const body = parseBody(init)
      ctx.mutate((d) => {
        const e = d.examinations.find((x) => x.id === id)
        if (e) {
          e.revokedAt = new Date()
          e.revocationReason = String(body.reason ?? '')
          const sup = body.supersededByExaminationId
          e.supersededByExaminationId = typeof sup === 'string' && sup ? sup : null
        }
      })
      return { status: 200, body: { examination: { id } } }
    }
  }

  return undefined
}

function saveExamination(ctx: MockContext, id: string, body: Record<string, unknown>): MockResult {
  ctx.mutate((d) => {
    const e = d.examinations.find((x) => x.id === id)
    if (!e) return
    for (const bucket of CLINICAL_BUCKETS) {
      const v = body[bucket]
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        ;(e as unknown as Record<string, unknown>)[bucket] = v
      }
    }
    if (Array.isArray(body.diagnoses)) e.diagnoses = body.diagnoses as string[]
    if (typeof body.clinicalFindings === 'string') e.clinicalFindings = body.clinicalFindings
    if (typeof body.recommendations === 'string') e.recommendations = body.recommendations
    if (typeof body.notes === 'string') e.notes = body.notes
    if (body.verdict === null || typeof body.verdict === 'string') {
      e.verdict = (body.verdict as SandboxExamination['verdict']) ?? null
    }
    if (typeof body.verdictConditions === 'string') e.verdictConditions = body.verdictConditions
    e.inaptTemporarUntil = parseDateOrNull(body.inaptTemporarUntil)
    e.nextExaminationDueDate = parseDateOrNull(body.nextExaminationDueDate)
    e.examinedAt = parseDateOrNull(body.examinedAt) ?? e.examinedAt
  })
  return { status: 200, body: { examination: { id } } }
}

function parseDateOrNull(v: unknown): Date | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function createExamination(ctx: MockContext, body: Record<string, unknown>): MockResult {
  const employeeId = String(body.employeeId ?? '')
  const typeId = String(body.examinationTypeId ?? '')
  const employee = ctx.data.employees.find((e) => e.id === employeeId)
  const type = ctx.data.examinationTypes.find((t) => t.id === typeId)
  if (!employee || !type) return { status: 404, body: { error: 'employee_not_found' } }

  const workplaceId =
    (typeof body.workplaceId === 'string' && body.workplaceId) || employee.workplaceId
  const companyId = employee.companyId
  if (!workplaceId || !companyId) {
    return { status: 400, body: { error: 'validation_failed', issues: ['Loc de muncă lipsă'] } }
  }

  const id = newId('newexam0')
  const now = new Date()
  const year = now.getFullYear()
  const sequence =
    Math.max(
      0,
      ...ctx.data.examinations
        .filter((e) => e.examinationYear === year)
        .map((e) => e.examinationSequence)
    ) + 1
  const scheduledAt = parseDateOrNull(body.scheduledAt) ?? now

  const exam: SandboxExamination = {
    id,
    employeeId,
    companyId,
    workplaceId,
    examinationTypeId: type.id,
    examinationTypeCode: type.code,
    examinationNumber: `${year}/${String(sequence).padStart(4, '0')}`,
    examinationYear: year,
    examinationSequence: sequence,
    status: 'scheduled',
    scheduledAt,
    startedAt: null,
    completedAt: null,
    examinedAt: null,
    signedAt: null,
    createdAt: now,
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
    notes: typeof body.notes === 'string' ? body.notes : '',
    revokedAt: null,
    revocationReason: null,
    supersededByExaminationId: null,
  }
  ctx.mutate((d) => {
    d.examinations.push(exam)
  })
  return { status: 201, body: { examination: { id } } }
}

// ── Canned AI content ────────────────────────────────────────────────────

function examinationSummary(
  data: SandboxData,
  employeeId: string
): {
  summary: string | null
  examinationCount: number
} {
  const emp = data.employees.find((e) => e.id === employeeId)
  if (!emp) return { summary: null, examinationCount: 0 }
  const prior = data.examinations.filter(
    (e) => e.employeeId === employeeId && e.signedAt !== null && e.status === 'completed'
  )
  if (prior.length === 0) {
    return {
      summary:
        'Nu există examinări anterioare semnate pentru acest angajat în cabinet. Prima evaluare documentată aici.',
      examinationCount: 0,
    }
  }
  const last = prior.slice().sort((a, b) => b.signedAt!.getTime() - a.signedAt!.getTime())[0]
  const verdictRo: Record<string, string> = {
    apt: 'apt',
    apt_conditionat: 'apt condiționat',
    inapt_temporar: 'inapt temporar',
    inapt: 'inapt',
  }
  const cond = last.verdictConditions ? ` (${last.verdictConditions.replace(/\.$/, '')})` : ''
  const summary = `${emp.lastName} ${emp.firstName} are ${prior.length} ${prior.length === 1 ? 'examinare anterioară' : 'examinări anterioare'} în cabinet. Ultimul aviz: ${verdictRo[last.verdict ?? 'apt'] ?? 'apt'}${cond}. Fără boli profesionale declarate; parametri vitali în limite normale la ultima evaluare.`
  return { summary, examinationCount: prior.length }
}

interface Recommendation {
  investigation: string
  priority: 'obligatorie' | 'recomandata'
  basis: string
}

function investigationSuggestions(
  data: SandboxData,
  examinationId: string
): {
  summary: string
  recommendations: Recommendation[]
  hazardCount: number
} {
  const exam = data.examinations.find((e) => e.id === examinationId)
  const wp = exam ? data.workplaces.find((w) => w.id === exam.workplaceId) : undefined
  const hazards = wp?.hazards ?? []
  const recs: Recommendation[] = []
  const add = (r: Recommendation) => {
    if (!recs.some((x) => x.investigation === r.investigation)) recs.push(r)
  }
  for (const h of hazards) {
    switch (h.key) {
      case 'zgomot':
        add({
          investigation: 'Audiogramă',
          priority: 'obligatorie',
          basis: 'Expunere la zgomot profesional',
        })
        break
      case 'pulberi':
      case 'sudura':
        add({
          investigation: 'Spirometrie (PFV)',
          priority: 'obligatorie',
          basis: 'Expunere la pulberi / fum de sudură',
        })
        add({
          investigation: 'Radiografie pulmonară',
          priority: 'recomandata',
          basis: 'Supraveghere respiratorie',
        })
        break
      case 'videoterminale':
        add({
          investigation: 'Examen oftalmologic',
          priority: 'obligatorie',
          basis: 'Lucru la videoterminal',
        })
        break
      case 'biologic':
        add({
          investigation: 'Hemoleucogramă + probe hepatice',
          priority: 'obligatorie',
          basis: 'Expunere la agenți biologici',
        })
        break
      case 'chimic':
        add({
          investigation: 'Probe hepatice (TGO/TGP)',
          priority: 'obligatorie',
          basis: 'Expunere la substanțe chimice',
        })
        break
      case 'efort_fizic':
      case 'manipulare':
        add({
          investigation: 'Examen clinic aparat locomotor',
          priority: 'recomandata',
          basis: 'Efort fizic / manipulare manuală',
        })
        break
      case 'inaltime':
        add({
          investigation: 'EKG + examen neurologic',
          priority: 'obligatorie',
          basis: 'Lucru la înălțime',
        })
        break
      default:
        break
    }
  }
  if (recs.length === 0) {
    add({
      investigation: 'Examen clinic general',
      priority: 'recomandata',
      basis: 'Evaluare periodică de rutină',
    })
  }
  const presentHazards = new Set(hazards.map((h) => h.key)).size
  return {
    summary:
      presentHazards > 0
        ? `Profil de risc cu ${presentHazards} ${presentHazards === 1 ? 'factor activ' : 'factori activi'}; investigațiile de mai jos acoperă expunerile declarate.`
        : 'Profil de risc redus; investigații de rutină.',
    recommendations: recs,
    hazardCount: presentHazards,
  }
}

/**
 * Map a document/fișă `window.open` URL to a static PDF under
 * `/sandbox/pdfs/`. The shim opens the returned path; a null blocks the
 * navigation rather than hitting `/api`. "Closest match" picks the sheet by
 * docKey, falling back to the fișă de aptitudine.
 */
export function resolveStaticPdf(url: URL): string | null {
  const p = url.pathname
  if (!p.startsWith('/api/examinations/')) return null
  if (p.endsWith('/fisa-pdf')) return '/sandbox/pdfs/fisa-aptitudine.pdf'
  const docMatch = p.match(/\/documents\/([a-z_]+)$/)
  if (docMatch) {
    const key = docMatch[1]
    if (key === 'examen_periodic') return '/sandbox/pdfs/examen-periodic.pdf'
    if (key === 'examen_angajare') return '/sandbox/pdfs/examen-angajare.pdf'
    if (key === 'dosar_medical') return '/sandbox/pdfs/dosar-medical.pdf'
    if (key === 'fisa_aptitudine') return '/sandbox/pdfs/fisa-aptitudine.pdf'
    // bilet_trimitere, adeverinta, etc. → closest sample
    return '/sandbox/pdfs/fisa-aptitudine.pdf'
  }
  return null
}

/**
 * POST /api/ai/investigation-suggestions
 *
 * Returns AI-generated investigation recommendations for an examination based
 * on the employee's workplace risk profile and examination type.
 *
 * PRIVACY: Only hazard categories, severity levels, approximate age bucket, and
 * examination type code are sent to the AI. No names, CNPs, or dates.
 *
 * Response:
 *   { recommendations: Recommendation[], summary: string, hazardCount: number }
 *   { recommendations: [], reason: 'no_hazards' | 'no_examination' | 'ai_unavailable' ... }
 */

import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getApiUser } from '@/lib/auth'
import { logAiUsage } from '@/lib/ai/usage-log'
import { canWriteClinical } from '@/lib/permissions/tenant-data'
import { checkAiRateLimit } from '@/lib/ai/rate-limit'
import { prisma } from '@/lib/prisma'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvestigationRecommendation {
  investigation: string
  basis: string
  priority: 'obligatorie' | 'recomandata'
  formSection: 'hearing' | 'lung' | 'vision' | 'additional' | null
}

const VALID_PRIORITIES = ['obligatorie', 'recomandata'] as const
const VALID_FORM_SECTIONS = ['hearing', 'lung', 'vision', 'additional', null] as const

function validateRecommendation(r: unknown): InvestigationRecommendation | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  const rec = r as Record<string, unknown>
  if (typeof rec.investigation !== 'string' || rec.investigation.trim().length === 0) return null
  if (typeof rec.basis !== 'string') return null
  if (!VALID_PRIORITIES.includes(rec.priority as typeof VALID_PRIORITIES[number])) return null
  const fs = rec.formSection === undefined ? null : rec.formSection
  if (!VALID_FORM_SECTIONS.includes(fs as typeof VALID_FORM_SECTIONS[number])) return null
  return {
    investigation: rec.investigation.slice(0, 300),
    basis: typeof rec.basis === 'string' ? rec.basis.slice(0, 300) : '',
    priority: rec.priority as InvestigationRecommendation['priority'],
    formSection: fs as InvestigationRecommendation['formSection'],
  }
}

export interface InvestigationSuggestionsResult {
  recommendations: InvestigationRecommendation[]
  summary: string | null
  hazardCount: number
  reason?: string
}

// ─── In-memory cache (10-minute TTL, keyed by examinationId) ─────────────────

const cache = new Map<string, { result: InvestigationSuggestionsResult; expiresAt: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000

function getCached(key: string): InvestigationSuggestionsResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.result
}
function setCache(key: string, result: InvestigationSuggestionsResult) {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Hazard label map (RO) ────────────────────────────────────────────────────

const HAZARD_LABELS: Record<string, string> = {
  noise: 'zgomot',
  vibrations: 'vibrații',
  ionizingRadiation: 'radiații ionizante',
  electromagneticFields: 'câmpuri electromagnetice',
  extremeTemperatures: 'temperaturi extreme',
  lightingDeficiency: 'iluminat deficitar',
  dust: 'pulberi',
  fumes: 'fumuri',
  vapors: 'vapori',
  solvents: 'solvenți',
  heavyMetals: 'metale grele',
  acidsOrBases: 'acizi/baze',
  bacteria: 'bacterii',
  viruses: 'virusuri',
  fungi: 'fungi/mucegaiuri',
  bloodbornePathogens: 'agenți patogeni sanguini',
  manualHandling: 'manipulare manuală greutăți',
  repetitiveMovements: 'mișcări repetitive',
  awkwardPostures: 'posturi forțate',
  screenWork: 'lucru la ecran',
  nightShift: 'muncă nocturnă',
  workplaceStress: 'stres ocupațional',
  isolatedWork: 'muncă izolată',
  violenceRisk: 'risc de violență',
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'scăzută',
  medium: 'medie',
  high: 'ridicată',
}

const CATEGORY_LABELS: Record<string, string> = {
  physical: 'Fizic',
  chemical: 'Chimic',
  biological: 'Biologic',
  ergonomic: 'Ergonomic',
  psychosocial: 'Psihosocial',
}

// Exam types where hazard-based investigation suggestions don't apply
const NON_HAZARD_EXAM_TYPES = new Set([
  'incetare_munca',
  'la_cerere',
  'certificat_invatamant',
  'certificat_magistratura',
  'protectia_maternitatii',
])

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiUser()
    if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!checkAiRateLimit(auth.user.id)) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })
    }

    if (!process.env.ANTHROPIC_API_KEY) return empty('ai_unavailable')

    const body = await request.json().catch(() => null)
    if (!body || typeof body.examinationId !== 'string') return empty('bad_request')

    const { examinationId } = body as { examinationId: string }

    const cached = getCached(examinationId)
    if (cached) return NextResponse.json(cached)

    const examination = await prisma.examination.findFirst({
      where: { id: examinationId, tenantId: auth.user.tenantId, deletedAt: null },
      select: {
        employee: { select: { birthDate: true, gender: true } },
        workplace: { select: { riskProfile: true } },
        examinationType: { select: { code: true, nameRo: true } },
      },
    })

    if (!examination) return empty('not_found')

    // Skip non-hazard exam types
    if (NON_HAZARD_EXAM_TYPES.has(examination.examinationType.code)) {
      const result = empty_result('no_hazards')
      setCache(examinationId, result)
      return NextResponse.json(result)
    }

    const rp = parseRiskProfile(examination.workplace.riskProfile)

    // Collect active hazards
    const activeHazards: { category: string; hazard: string; severity: string }[] = []
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazard of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean; severity?: string }>)[hazard]
        if (entry?.present) {
          activeHazards.push({
            category,
            hazard,
            severity: entry.severity ?? 'medium',
          })
        }
      }
    }

    if (activeHazards.length === 0) {
      const result = empty_result('no_hazards')
      setCache(examinationId, result)
      return NextResponse.json(result)
    }

    // Approximate age bucket — never send birthdate or exact age
    const ageGroup = examination.employee.birthDate
      ? (() => {
          const age = new Date().getFullYear() - examination.employee.birthDate.getFullYear()
          if (age < 30) return 'sub 30 ani'
          if (age < 45) return '30-44 ani'
          if (age < 55) return '45-54 ani'
          return '55+ ani'
        })()
      : null

    // Build prompt lines (no PII)
    const hazardLines: string[] = []
    const byCategory = new Map<string, typeof activeHazards>()
    for (const h of activeHazards) {
      if (!byCategory.has(h.category)) byCategory.set(h.category, [])
      byCategory.get(h.category)!.push(h)
    }
    for (const [cat, entries] of byCategory) {
      const label = CATEGORY_LABELS[cat] ?? cat
      const items = entries.map((e) => `${HAZARD_LABELS[e.hazard] ?? e.hazard} (severitate ${SEVERITY_LABELS[e.severity] ?? e.severity})`).join(', ')
      hazardLines.push(`- ${label}: ${items}`)
    }

    const promptContent = [
      `Tip examinare: ${examination.examinationType.nameRo} (cod: ${examination.examinationType.code})`,
      `Factori de risc activi la locul de muncă:`,
      ...hazardLines,
      ageGroup ? `Grup de vârstă aproximativ: ${ageGroup}` : null,
      ``,
      `Conform HG 355/2007 și normelor aplicabile, listează investigațiile medicale obligatorii și recomandate pentru această examinare.`,
      ``,
      `Returnează EXCLUSIV JSON valid cu formatul următor:`,
      `{`,
      `  "recommendations": [`,
      `    {`,
      `      "investigation": "Audiometrie tonală liminar",`,
      `      "basis": "HG 355/2007, Anexa 1 — expunere la zgomot",`,
      `      "priority": "obligatorie",`,
      `      "formSection": "hearing"`,
      `    }`,
      `  ],`,
      `  "summary": "Notă scurtă despre profilul de risc dominant (max 2 propoziții)."`,
      `}`,
      ``,
      `Reguli:`,
      `- priority: "obligatorie" sau "recomandata"`,
      `- formSection: "hearing", "lung", "vision", "additional" sau null`,
      `- maximum 8 investigații, ordonate de la obligatorii la recomandate`,
      `- baza legală concisă, cu articol sau anexă când e cunoscut`,
    ].filter((l) => l !== null).join('\n')

    if (process.env.NODE_ENV === 'development') {
      console.log('[investigation-suggestions] prompt:\n', promptContent)
    }

    const MODEL = 'claude-sonnet-4-6'
    const start = Date.now()
    let aiMessage: Anthropic.Message | undefined
    let aiSuccess = false
    let aiError: string | undefined
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    try {
      aiMessage = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: `Ești expert în medicina muncii din România, cu cunoștințe aprofundate despre HG 355/2007 și normele aplicabile. Răspunde EXCLUSIV cu JSON valid, fără niciun text în afara JSON-ului.`,
        messages: [{ role: 'user', content: promptContent }],
      })
      aiSuccess = true
    } catch (err) {
      aiError = (err as Error).message
      throw err
    } finally {
      void logAiUsage({
        tenantId: auth.user.tenantId,
        userId: auth.user.id,
        route: '/api/ai/investigation-suggestions',
        model: MODEL,
        usage: aiMessage?.usage ?? null,
        durationMs: Date.now() - start,
        success: aiSuccess,
        errorMessage: aiError,
      })
    }
    const message = aiMessage

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Strip markdown code fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { recommendations: InvestigationRecommendation[]; summary: string } | null = null
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('[investigation-suggestions] JSON parse error. Raw:', rawText.slice(0, 200))
    }

    if (
      !parsed ||
      !Array.isArray(parsed.recommendations) ||
      parsed.recommendations.length === 0
    ) {
      const result = empty_result('parse_error')
      setCache(examinationId, result)
      return NextResponse.json(result)
    }

    const validRecommendations = parsed.recommendations
      .map(validateRecommendation)
      .filter((r): r is InvestigationRecommendation => r !== null)
      .slice(0, 8)

    if (validRecommendations.length === 0) {
      const result = empty_result('parse_error')
      setCache(examinationId, result)
      return NextResponse.json(result)
    }

    const result: InvestigationSuggestionsResult = {
      recommendations: validRecommendations,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500).trim() : null,
      hazardCount: activeHazards.length,
    }
    setCache(examinationId, result)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[investigation-suggestions] error:', err)
    return NextResponse.json(empty_result('error'))
  }
}

function empty(reason: string) {
  return NextResponse.json(empty_result(reason))
}

function empty_result(reason: string): InvestigationSuggestionsResult {
  return { recommendations: [], summary: null, hazardCount: 0, reason }
}

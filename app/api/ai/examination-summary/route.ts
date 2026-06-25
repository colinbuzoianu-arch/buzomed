/**
 * POST /api/ai/examination-summary
 *
 * Generates a Romanian-language clinical summary of an employee's signed
 * examination history for display to the practitioner.
 *
 * TESTING GUIDANCE:
 * - Employee with 0 prior signed exams → { summary: null, reason: "no_history" }
 * - Employee with 2+ prior signed exams → Romanian-language summary string
 * - ANTHROPIC_API_KEY removed from env → { summary: null, reason: "ai_unavailable" }
 * - Verify the prompt logged in dev contains no names, CNPs, or actual dates
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canWriteClinical } from '@/lib/permissions/tenant-data'
import { checkAiRateLimit } from '@/lib/ai/rate-limit'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import type { ExaminationVerdict } from '@prisma/client'
import { logAiUsage } from '@/lib/ai/usage-log'

// ─── In-memory cache (per process, 10-minute TTL) ──────────────────────────
const summaryCache = new Map<string, {
  summary: string | null
  reason?: string
  examinationCount: number
  expiresAt: number
}>()
const CACHE_TTL_MS = 10 * 60 * 1000

function getCached(key: string) {
  const entry = summaryCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    summaryCache.delete(key)
    return null
  }
  return entry
}

function setCache(
  key: string,
  value: { summary: string | null; reason?: string; examinationCount: number }
) {
  summaryCache.set(key, { ...value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── GDPR ANONYMIZATION LAYER ─────────────────────────────────────────────
// No personal identifiers may pass this boundary.
// If in doubt, exclude the field.

function stripRomanianNames(text: string): string {
  // Remove consecutive capitalized words that resemble Romanian names.
  // Conservative pattern — redact too much rather than expose a name.
  return text.replace(
    /\b([A-ZĂÂÎȘȚ][a-zăâîșțA-ZĂÂÎȘȚ]+)(\s+[A-ZĂÂÎȘȚ][a-zăâîșțA-ZĂÂÎȘȚ]+){1,3}\b/g,
    '[REDACTAT]'
  )
}

function extractNum(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const v = (obj as Record<string, unknown>)[key]
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isNaN(n) ? null : n
}

function extractStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const v = (obj as Record<string, unknown>)[key]
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

interface AnonymizedExam {
  monthsAgo: number
  verdict: ExaminationVerdict | null
  verdictConditions: string | null
  vitalSigns: {
    bpSystolic: number | null
    bpDiastolic: number | null
    pulse: number | null
    height: number | null
    weight: number | null
  }
  visionTest: { left: string | null; right: string | null }
  hearingTest: { left: string | null; right: string | null }
  lungFunction: { fev1: number | null; fvc: number | null; ratio: number | null }
}

function anonymizeExamination(exam: {
  signedAt: Date | null
  verdict: ExaminationVerdict | null
  verdictConditions: string | null
  vitalSigns: unknown
  visionTest: unknown
  hearingTest: unknown
  lungFunction: unknown
}): AnonymizedExam {
  const now = new Date()
  const monthsAgo = exam.signedAt
    ? Math.max(
        0,
        Math.round(
          (now.getTime() - exam.signedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
        )
      )
    : 0

  return {
    monthsAgo,
    verdict: exam.verdict,
    verdictConditions: exam.verdictConditions
      ? stripRomanianNames(exam.verdictConditions).trim() || null
      : null,
    vitalSigns: {
      bpSystolic: extractNum(exam.vitalSigns, 'bpSystolic'),
      bpDiastolic: extractNum(exam.vitalSigns, 'bpDiastolic'),
      pulse: extractNum(exam.vitalSigns, 'pulse'),
      height: extractNum(exam.vitalSigns, 'height'),
      weight: extractNum(exam.vitalSigns, 'weight'),
    },
    visionTest: {
      left: extractStr(exam.visionTest, 'left'),
      right: extractStr(exam.visionTest, 'right'),
    },
    hearingTest: {
      left: extractStr(exam.hearingTest, 'left'),
      right: extractStr(exam.hearingTest, 'right'),
    },
    lungFunction: {
      fev1: extractNum(exam.lungFunction, 'fev1'),
      fvc: extractNum(exam.lungFunction, 'fvc'),
      ratio: extractNum(exam.lungFunction, 'ratio'),
    },
  }
}

function buildPromptContent(
  exams: AnonymizedExam[],
  patientAge: number | null,
  patientGender: string | null
): string {
  const lines: string[] = []

  if (patientAge !== null || patientGender) {
    const parts: string[] = []
    if (patientAge !== null) parts.push(`Vârstă aproximativă: ${patientAge} ani`)
    if (patientGender) {
      const g =
        patientGender.toUpperCase() === 'M'
          ? 'M'
          : patientGender.toUpperCase() === 'F'
            ? 'F'
            : null
      if (g) parts.push(`Gen: ${g}`)
    }
    if (parts.length) lines.push(`Date pacient: ${parts.join(', ')}`, '')
  }

  lines.push('Istoricul examinărilor de medicina muncii:', '')

  exams.forEach((e, i) => {
    lines.push(`Examinare ${i + 1} (acum ${e.monthsAgo} luni):`)
    if (e.verdict) lines.push(`  Verdict: ${e.verdict.replace(/_/g, ' ')}`)
    if (e.verdictConditions) lines.push(`  Condiții/restricții: ${e.verdictConditions}`)

    const bp =
      e.vitalSigns.bpSystolic !== null && e.vitalSigns.bpDiastolic !== null
        ? `${e.vitalSigns.bpSystolic}/${e.vitalSigns.bpDiastolic} mmHg`
        : null
    if (bp) lines.push(`  Tensiune arterială: ${bp}`)
    if (e.vitalSigns.pulse !== null) lines.push(`  Puls: ${e.vitalSigns.pulse} bpm`)
    if (e.vitalSigns.height !== null) lines.push(`  Înălțime: ${e.vitalSigns.height} cm`)
    if (e.vitalSigns.weight !== null) lines.push(`  Greutate: ${e.vitalSigns.weight} kg`)

    if (e.visionTest.right !== null || e.visionTest.left !== null) {
      lines.push(
        `  Vizibilitate: OD ${e.visionTest.right ?? '—'}, OS ${e.visionTest.left ?? '—'}`
      )
    }
    if (e.hearingTest.right !== null || e.hearingTest.left !== null) {
      lines.push(
        `  Audiometrie: OD ${e.hearingTest.right ?? '—'}, OS ${e.hearingTest.left ?? '—'}`
      )
    }
    const lungParts = [
      e.lungFunction.fev1 !== null ? `FEV1 ${e.lungFunction.fev1}%` : null,
      e.lungFunction.fvc !== null ? `CVF ${e.lungFunction.fvc}%` : null,
      e.lungFunction.ratio !== null ? `raport ${e.lungFunction.ratio}%` : null,
    ].filter(Boolean)
    if (lungParts.length) lines.push(`  Spirometrie: ${lungParts.join(', ')}`)

    lines.push('')
  })

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiUser()
    if (!auth.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!checkAiRateLimit(auth.user.id)) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ summary: null, reason: 'ai_unavailable', examinationCount: 0 })
    }

    const body = await request.json().catch(() => null)
    if (
      !body ||
      typeof body.employeeId !== 'string'
    ) {
      return NextResponse.json({ summary: null, reason: 'bad_request', examinationCount: 0 })
    }

    const currentExaminationId: string | null =
      typeof body.currentExaminationId === 'string' && body.currentExaminationId.trim() !== ''
        ? body.currentExaminationId
        : null

    const { employeeId } = body as { employeeId: string }
    const cacheKey = `${employeeId}:${currentExaminationId ?? 'profile'}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // Fetch employee — only birthDate + gender for prompt context, never name/CNP
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: auth.user.tenantId,
        deletedAt: null,
      },
      select: { birthDate: true, gender: true },
    })

    if (!employee) {
      return NextResponse.json({ summary: null, reason: 'not_found', examinationCount: 0 })
    }

    // Signed examinations for this employee, excluding the current one if present
    const priorExams = await prisma.examination.findMany({
      where: {
        tenantId: auth.user.tenantId,
        employeeId,
        signedAt: { not: null },
        deletedAt: null,
        ...(currentExaminationId ? { id: { not: currentExaminationId } } : {}),
      },
      orderBy: { signedAt: 'desc' },
      take: currentExaminationId ? 3 : 5,
      select: {
        signedAt: true,
        verdict: true,
        verdictConditions: true,
        vitalSigns: true,
        visionTest: true,
        hearingTest: true,
        lungFunction: true,
      },
    })

    if (priorExams.length === 0) {
      const result = { summary: null, reason: 'no_history', examinationCount: 0 }
      setCache(cacheKey, result)
      return NextResponse.json(result)
    }

    // Approximate age — year difference only, never the actual date
    const patientAge = employee.birthDate
      ? new Date().getFullYear() - employee.birthDate.getFullYear()
      : null

    const anonymized = priorExams.map((e) =>
      anonymizeExamination({
        signedAt: e.signedAt,
        verdict: e.verdict,
        verdictConditions: e.verdictConditions,
        vitalSigns: e.vitalSigns,
        visionTest: e.visionTest,
        hearingTest: e.hearingTest,
        lungFunction: e.lungFunction,
      })
    )

    const promptContent = buildPromptContent(anonymized, patientAge, employee.gender)

    if (process.env.NODE_ENV === 'development') {
      console.log('[examination-summary] prompt sent to AI:\n', promptContent)
    }

    const systemPrompt = `Ești un asistent medical pentru medicina muncii românesc.
Scrie un rezumat clinic succint (3-4 propoziții) al istoricului de examinări furnizat.
Reguli obligatorii:
- Scrie exclusiv în română
- Fii factual și neutru — descrie doar ceea ce este prezent în date, nu inventa nimic
- Folosește limbaj clinic adecvat pentru un medic de medicina muncii
- Nu menționa niciodată date personale (nu există în date)
- Evidențiază: verdictele acordate, tendințe în semne vitale sau teste, condiții sau restricții recurente
- Dacă datele sunt incomplete, descrie doar ceea ce era disponibil
- Maxim 4 propoziții, fiecare clară și concisă`

    const MODEL = 'claude-sonnet-4-6'
    const start = Date.now()
    let aiMessage: Anthropic.Message | undefined
    let aiSuccess = false
    let aiError: string | undefined
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    try {
      aiMessage = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
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
        route: '/api/ai/examination-summary',
        model: MODEL,
        usage: aiMessage?.usage ?? null,
        durationMs: Date.now() - start,
        success: aiSuccess,
        errorMessage: aiError,
      })
    }
    const message = aiMessage

    const summary =
      message.content[0].type === 'text' ? message.content[0].text.trim() : null

    const result = { summary, examinationCount: priorExams.length }
    setCache(cacheKey, result)
    return NextResponse.json(result)
  } catch (err) {
    // Never return 500 — a failed AI summary is not an application error
    console.error('[examination-summary] error:', err)
    return NextResponse.json({ summary: null, reason: 'error', examinationCount: 0 })
  }
}

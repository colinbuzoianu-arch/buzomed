/**
 * POST /api/ai/examination-prefill
 *
 * Pre-fills examination form fields from the employee's prior exam history
 * using Claude. Returns a map of field keys → { value, confidence } so the
 * practitioner can review before accepting.
 *
 * Error contract: never returns 5xx — a failed prefill falls back to
 * { suggestions: {} } so the form stays usable.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { getSectionsForExamType } from '@/lib/examinations/document-templates'

function extractStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const v = (obj as Record<string, unknown>)[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

function extractNum(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const v = (obj as Record<string, unknown>)[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isNaN(n) ? null : n
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiUser()
    if (!auth.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!auth.user.tenantId) {
      return NextResponse.json({ suggestions: {} })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ suggestions: {} })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.examinationId !== 'string') {
      return NextResponse.json({ suggestions: {} })
    }

    const { examinationId } = body as { examinationId: string }

    // Fetch the current examination with all needed relations
    const examination = await prisma.examination.findFirst({
      where: { id: examinationId, tenantId: auth.user.tenantId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            birthDate: true,
            gender: true,
            jobTitle: true,
          },
        },
        workplace: {
          include: { company: { select: { name: true } } },
        },
        examinationType: { select: { code: true, nameRo: true } },
      },
    })

    if (!examination) {
      return NextResponse.json({ suggestions: {} })
    }

    const { employee, workplace, examinationType } = examination

    // Most recent prior completed examination for this employee
    const priorExam = await prisma.examination.findFirst({
      where: {
        tenantId: auth.user.tenantId,
        employeeId: employee.id,
        id: { not: examinationId },
        signedAt: { not: null },
        deletedAt: null,
      },
      orderBy: { signedAt: 'desc' },
      select: {
        signedAt: true,
        verdict: true,
        anamnesis: true,
        vitalSigns: true,
        examinationType: { select: { nameRo: true } },
      },
    })

    const sections = getSectionsForExamType(examinationType.code)

    // Build context object for Claude
    const patientAge = employee.birthDate
      ? new Date().getFullYear() - employee.birthDate.getFullYear()
      : null

    const context: Record<string, unknown> = {
      pacient: {
        varsta: patientAge,
        sex: employee.gender,
        functie: employee.jobTitle ?? null,
      },
      locDeMunca: {
        companie: workplace.company.name,
        sectie: workplace.name,
      },
      tipExaminare: examinationType.nameRo,
    }

    if (priorExam) {
      const monthsAgo = priorExam.signedAt
        ? Math.round(
            (Date.now() - priorExam.signedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
          )
        : null

      context.examinareAnterioara = {
        acumLuni: monthsAgo,
        tip: priorExam.examinationType.nameRo,
        verdict: priorExam.verdict,
        anamneza: {
          general: extractStr(priorExam.anamnesis, 'general'),
          bolicronice: extractStr(priorExam.anamnesis, 'chronicConditions'),
          medicatie: extractStr(priorExam.anamnesis, 'medications'),
          alergii: extractStr(priorExam.anamnesis, 'allergies'),
          antecedenteFamiliale: extractStr(priorExam.anamnesis, 'familyHistory'),
          antecedenteProfesionale: extractStr(priorExam.anamnesis, 'occupationalHistory'),
        },
        semneVitale: {
          inaltime: extractNum(priorExam.vitalSigns, 'height'),
          greutate: extractNum(priorExam.vitalSigns, 'weight'),
          taSistolica: extractNum(priorExam.vitalSigns, 'bpSystolic'),
          taDiastolica: extractNum(priorExam.vitalSigns, 'bpDiastolic'),
          puls: extractNum(priorExam.vitalSigns, 'pulse'),
        },
      }
    }

    // Build the target field schema (only fields relevant to current exam type)
    const targetFields: string[] = []
    if (sections.showAnamnesis) {
      targetFields.push(
        'anamnesis.general',
        'anamnesis.chronicConditions',
        'anamnesis.medications',
        'anamnesis.allergies',
        'anamnesis.familyHistory',
        'anamnesis.occupationalHistory'
      )
    }
    if (sections.showVitalSigns) {
      targetFields.push('vitalSigns.height', 'vitalSigns.weight')
    }

    if (targetFields.length === 0 || !priorExam) {
      return NextResponse.json({ suggestions: {} })
    }

    const systemPrompt = `Ești un asistent medical pentru un medic de medicina muncii din România.
Pe baza istoricului pacientului, pre-completează câmpurile pentru examinarea curentă.
Răspunde DOAR cu un obiect JSON valid, fără text suplimentar, fără markdown.
Structura JSON trebuie să respecte exact schema primită.
Marchează fiecare câmp sugerat cu un nivel de încredere: "high" (date obiective din istoric), "med" (inferență rezonabilă), "low" (estimare).
Nu inventa date. Dacă nu știi, omite câmpul.`

    const userMessage = `Context pacient:
${JSON.stringify(context, null, 2)}

Câmpuri de completat (returnează un obiect JSON cu aceste chei):
${targetFields.map((f) => `- "${f}"`).join('\n')}

Format răspuns:
{
  "anamnesis.chronicConditions": { "value": "text...", "confidence": "high" },
  "vitalSigns.height": { "value": 175, "confidence": "high" }
}`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    const VALID_CONFIDENCES = ['high', 'med', 'low'] as const
    const targetFieldSet = new Set(targetFields)

    let suggestions: Record<string, { value: unknown; confidence: 'high' | 'med' | 'low' }> = {}
    try {
      const parsed = JSON.parse(rawText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, entry] of Object.entries(parsed)) {
          if (!targetFieldSet.has(key)) continue
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
          const e = entry as Record<string, unknown>
          if (!VALID_CONFIDENCES.includes(e.confidence as typeof VALID_CONFIDENCES[number])) continue
          suggestions[key] = {
            value: e.value,
            confidence: e.confidence as 'high' | 'med' | 'low',
          }
        }
      }
    } catch {
      // Unparseable response — return empty suggestions, not a 500
      if (process.env.NODE_ENV === 'development') {
        console.warn('[examination-prefill] Claude returned unparseable JSON:', rawText)
      }
    }

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[examination-prefill] error:', err)
    return NextResponse.json({ suggestions: {} })
  }
}

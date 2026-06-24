/**
 * POST /api/ai/itm-briefing
 *
 * Generates an ITM inspection readiness briefing for a company-year pair.
 * Uses aggregate compliance data only — no employee names or personal data
 * are sent to the AI model.
 *
 * Response: { briefing: ItmBriefing } | { briefing: null, reason: string }
 */

import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { computeComplianceData } from '@/lib/reports/compliance-data'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BriefingSectionSeverity = 'ok' | 'warning' | 'critical'

export interface BriefingSection {
  title: string
  severity: BriefingSectionSeverity
  items: string[]
}

export interface ItmBriefing {
  overallStatus: 'compliant' | 'at_risk' | 'non_compliant'
  overallAssessment: string
  sections: BriefingSection[]
  generatedAt: string
}

export interface ItmBriefingResult {
  briefing: ItmBriefing | null
  reason?: string
}

// ─── In-memory cache (30-minute TTL, keyed by companyId:year) ────────────────

const cache = new Map<string, { result: ItmBriefingResult; expiresAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

function getCached(key: string): ItmBriefingResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.result
}
function setCache(key: string, result: ItmBriefingResult) {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiUser()
    if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const hasReportingRole = auth.user.roles.some(
      (r) => r === 'practitioner' || r === 'practice_admin'
    )
    if (!hasReportingRole) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ briefing: null, reason: 'ai_unavailable' })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.companyId !== 'string') {
      return NextResponse.json({ briefing: null, reason: 'bad_request' })
    }

    const year: number =
      typeof body.year === 'number' && body.year >= 2000 && body.year <= 2100
        ? body.year
        : new Date().getFullYear()

    const cacheKey = `${auth.user.tenantId}:${body.companyId}:${year}`
    const cached = getCached(cacheKey)
    if (cached) return NextResponse.json(cached)

    const data = await computeComplianceData({
      companyId: body.companyId,
      tenantId: auth.user.tenantId,
      year,
    })

    if (!data) {
      return NextResponse.json({ briefing: null, reason: 'not_found' })
    }

    const { company, snapshot, annual, adherence, workplaceBreakdown } = data

    // Build a plain-text prompt with aggregate metrics only (no employee names/IDs)
    const wpLines = workplaceBreakdown
      .map((wp) => {
        const cov = wp.coverageRate !== null ? `${wp.coverageRate}%` : '—'
        return `  - "${wp.workplaceName}": ${wp.totalEmployees} angajați, conformitate ${cov} (valabili: ${wp.validFisa}, expirați: ${wp.expired}, neexaminați: ${wp.neverExamined})`
      })
      .join('\n')

    const promptContent = `
Companie: ${company.name}${company.cui ? ` (CUI: ${company.cui})` : ''}
An analizat: ${year}

=== SNAPSHOT CONFORMITATE (la zi) ===
- Total angajați activi: ${snapshot.totalActiveEmployees}
- Fișă medicală valabilă: ${snapshot.employeesWithValidFisa}
- Fișă medicală expirată: ${snapshot.employeesWithExpiredFisa}
- Neexaminați niciodată: ${snapshot.employeesNeverExamined}
- Rată de conformitate: ${snapshot.coverageRate !== null ? `${snapshot.coverageRate}%` : 'N/A'}
- Expiră în 30 zile: ${snapshot.expiringIn30Days}
- Expiră în 60 zile: ${snapshot.expiringIn60Days}

=== ACTIVITATE AN ${year} ===
- Total examinări create: ${annual.totalExaminationsYear}
- Examinări semnate: ${annual.signedExaminationsYear}
- Verdicte: Apt: ${annual.verdictBreakdown.apt}, Apt condiționat: ${annual.verdictBreakdown.apt_conditionat}, Inapt temporar: ${annual.verdictBreakdown.inapt_temporar}, Inapt: ${annual.verdictBreakdown.inapt}
- Zile medii de la programat la semnat: ${annual.avgDaysFromScheduledToSigned !== null ? annual.avgDaysFromScheduledToSigned : 'N/A'}

=== ADERENȚĂ RECHEMĂRI AN ${year} ===
- Total rechemări scadente: ${adherence.totalRecallsDue}
- Rechemări finalizate: ${adherence.recallsCompleted}
- Rechemări restante (curent): ${adherence.recallsOverdue}
- Rată de aderență: ${adherence.adherenceRate !== null ? `${adherence.adherenceRate}%` : 'N/A'}

=== SITUAȚIE PE LOCURI DE MUNCĂ ===
${wpLines || '  (niciun loc de muncă activ)'}

---

Ești expert în medicina muncii și inspecția muncii din România.
Generează un briefing de pregătire pentru o inspecție ITM (Inspectoratul Teritorial de Muncă) bazat pe datele de mai sus.

Returnează EXCLUSIV JSON valid cu formatul:
{
  "overallStatus": "compliant" | "at_risk" | "non_compliant",
  "overallAssessment": "2-3 propoziții cu evaluarea generală a situației de conformitate",
  "sections": [
    {
      "title": "Puncte slabe identificate",
      "severity": "warning" | "critical" | "ok",
      "items": ["item concret 1", "item concret 2"]
    },
    {
      "title": "Ce verifică inspectorul ITM",
      "severity": "ok",
      "items": ["verificare 1", "verificare 2"]
    },
    {
      "title": "Documente de pregătit",
      "severity": "ok",
      "items": ["document 1", "document 2"]
    },
    {
      "title": "Acțiuni prioritare înainte de inspecție",
      "severity": "warning" | "critical" | "ok",
      "items": ["acțiune 1", "acțiune 2"]
    }
  ]
}

Reguli:
- overallStatus: "compliant" dacă rată ≥ 90%, "at_risk" dacă 70-89%, "non_compliant" dacă < 70% sau neexaminați > 10% din total
- Menționează locurile de muncă cu probleme după nume (sunt din datele de mai sus, nu sunt date personale)
- Fii specific și acționabil — nu generic
- Maximum 6 items per secțiune
- Toate textele în română
`.trim()

    if (process.env.NODE_ENV === 'development') {
      console.log('[itm-briefing] prompt:\n', promptContent)
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `Ești expert în medicina muncii din România și cunoști bine procedurile de inspecție ITM conform HG 355/2007, Legea 319/2006 și normele în vigoare. Răspunde EXCLUSIV cu JSON valid, fără niciun text în afara JSON-ului.`,
      messages: [{ role: 'user', content: promptContent }],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: Pick<ItmBriefing, 'overallStatus' | 'overallAssessment' | 'sections'> | null = null
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      console.error('[itm-briefing] JSON parse error. Raw:', rawText.slice(0, 300))
    }

    if (!parsed || !Array.isArray(parsed.sections)) {
      const result: ItmBriefingResult = { briefing: null, reason: 'parse_error' }
      setCache(cacheKey, result)
      return NextResponse.json(result)
    }

    const briefing: ItmBriefing = {
      overallStatus: parsed.overallStatus ?? 'at_risk',
      overallAssessment: parsed.overallAssessment ?? '',
      sections: parsed.sections,
      generatedAt: new Date().toISOString(),
    }

    const result: ItmBriefingResult = { briefing }
    setCache(cacheKey, result)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[itm-briefing] error:', err)
    return NextResponse.json({ briefing: null, reason: 'error' })
  }
}

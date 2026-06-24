import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const VALID_COLUMN_KEYS = [
  'firstName',
  'lastName',
  'companyEmployeeId',
  'email',
  'department',
]

// Detect headers that look like actual data rather than column names.
// If any header matches, skip AI — this is a safety guard.
function looksLikeData(header: string): boolean {
  const h = header.trim()
  if (/^\d{13}$/.test(h)) return true // CNP (Romanian national ID)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return true // email address
  if (h.length > 80) return true // unusually long for a column header
  return false
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'api_key_missing' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.headers)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const headers: string[] = (body.headers as unknown[])
    .filter((h): h is string => typeof h === 'string')
    .slice(0, 30)

  if (headers.length === 0) {
    return NextResponse.json({ error: 'no_headers' }, { status: 400 })
  }

  // CRITICAL: abort if any header looks like actual employee data
  if (headers.some(looksLikeData)) {
    return NextResponse.json({ error: 'headers_look_like_data' }, { status: 422 })
  }

  const systemPrompt = `You are a CSV column header mapping assistant. Map column headers to employee field names.
Respond ONLY with valid JSON. No markdown, no explanation, no other text.`

  const userPrompt = `Map these CSV column headers to employee field names.

Headers: ${JSON.stringify(headers)}

Valid field names: firstName, lastName, companyEmployeeId, email, department

Field meanings:
- firstName: given name, prenume, first name, vorname, nome
- lastName: family name, surname, nume, nachname, cognome
- companyEmployeeId: employee ID, badge, matricola, marca, payroll ID, cod angajat
- email: email address, e-mail, adresa email
- department: department, workplace, sector, birou, sectie, abteilung, reparto

Return ONLY this JSON (no other text):
{
  "mapping": { "<header>": "<fieldName or null>" },
  "confidence": { "<header>": "high|medium|low" }
}

Include every header. Use null when unknown or not relevant.
Confidence: "high" = obvious match, "medium" = probable, "low" = guessed.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: { mapping: Record<string, string | null>; confidence: Record<string, string> }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ error: 'parse_failed' }, { status: 500 })
    }

    // Sanitize: only allow recognised field names in the mapping
    const mapping: Record<string, string | null> = {}
    const confidence: Record<string, 'high' | 'medium' | 'low'> = {}
    for (const header of headers) {
      const raw = parsed.mapping?.[header]
      mapping[header] =
        typeof raw === 'string' && VALID_COLUMN_KEYS.includes(raw) ? raw : null
      const conf = parsed.confidence?.[header]
      confidence[header] = (['high', 'medium', 'low'] as const).includes(
        conf as 'high' | 'medium' | 'low'
      )
        ? (conf as 'high' | 'medium' | 'low')
        : 'low'
    }

    return NextResponse.json({ mapping, confidence })
  } catch {
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
  }
}

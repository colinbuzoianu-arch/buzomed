import Anthropic from '@anthropic-ai/sdk'
import { type NextRequest, NextResponse } from 'next/server'
import { checkAiRateLimit } from '@/lib/ai/rate-limit'
import { logAiUsage } from '@/lib/ai/usage-log'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

const VALID_COLUMN_KEYS = [
  'firstName',
  'lastName',
  'cnp',
  'companyEmployeeId',
  'email',
  'department',
  'jobTitle',
  'workplaceName',
  'companyName',
  'cui',
  'companyAddress',
  'hireDate',
  'fitnessValidUntil',
  'fitnessValidUntilDay',
  'fitnessValidUntilMonth',
  'fitnessValidUntilYear',
  'notes',
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
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!checkAiRateLimit(auth.user.id)) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })
  }

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

Valid field names: firstName, lastName, cnp, companyEmployeeId, email, jobTitle, workplaceName, department, companyName, cui, companyAddress, hireDate, fitnessValidUntil, fitnessValidUntilDay, fitnessValidUntilMonth, fitnessValidUntilYear, notes

Field meanings:
- firstName: given name, prenume, first name, vorname, nome
- lastName: family name, surname, nume, nachname, cognome
- cnp: Romanian national ID number (cod numeric personal, c.n.p.) — this is a COLUMN HEADER only
- companyEmployeeId: employee ID, badge, matricola, marca, payroll ID, cod angajat
- email: email address, e-mail, adresa email
- jobTitle: role, functie, ocupatie, pozitie, beruf
- workplaceName: the specific work location / loc de muncă / punct de lucru / locatie / work site
- department: organizational unit, departament, sectie, birou, abteilung, reparto
- companyName: employer / company name / nume companie / firma / angajator
- cui: company fiscal code / CUI / cod fiscal / cif / VAT id
- companyAddress: company address / adresa companie / sediu social
- hireDate: employment start date, data angajarii, hire date, eintrittsdatum
- fitnessValidUntil: fitness-certificate expiry in ONE column, expirare fisa aptitudine, valabil pana la, scadenta
- fitnessValidUntilDay: the DAY part only of a split fitness-expiry date, "ziua exp", "ZIUA EXP."
- fitnessValidUntilMonth: the MONTH part only of a split fitness-expiry date, "luna exp", "LUNA EXP."
- fitnessValidUntilYear: the YEAR part only of a split fitness-expiry date, "anul exp", "ANUL EXP."
- notes: free-text remarks, mentiuni, observatii, obs

Return ONLY this JSON (no other text):
{
  "mapping": { "<header>": "<fieldName or null>" },
  "confidence": { "<header>": "high|medium|low" }
}

Include every header. Use null when unknown or not relevant.
Confidence: "high" = obvious match, "medium" = probable, "low" = guessed.`

  const MODEL = 'claude-haiku-4-5-20251001'
  const start = Date.now()
  let aiMessage: Anthropic.Message | undefined
  let aiSuccess = false
  let aiError: string | undefined
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    try {
      aiMessage = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
      aiSuccess = true
    } catch (err) {
      aiError = (err as Error).message
      throw err
    } finally {
      void logAiUsage({
        tenantId: auth.user.tenantId,
        userId: auth.user.id,
        route: '/api/ai/column-mapping',
        model: MODEL,
        usage: aiMessage?.usage ?? null,
        durationMs: Date.now() - start,
        success: aiSuccess,
        errorMessage: aiError,
      })
    }
    const message = aiMessage

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

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
      mapping[header] = typeof raw === 'string' && VALID_COLUMN_KEYS.includes(raw) ? raw : null
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

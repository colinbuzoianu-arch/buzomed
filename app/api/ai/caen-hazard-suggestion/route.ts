import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

// Valid hazard keys from the RiskProfile schema — sent to the model so it
// can only return keys that exist in our data model.
const ALL_VALID_HAZARD_KEYS = [
  // physical
  'noise', 'vibrations', 'ionizingRadiation', 'electromagneticFields',
  'extremeTemperatures', 'lightingDeficiency',
  // chemical
  'dust', 'fumes', 'vapors', 'solvents', 'heavyMetals', 'acidsOrBases',
  // biological
  'bacteria', 'viruses', 'fungi', 'bloodbornePathogens',
  // ergonomic
  'manualHandling', 'repetitiveMovements', 'awkwardPostures', 'screenWork', 'nightShift',
  // psychosocial
  'workplaceStress', 'isolatedWork', 'violenceRisk',
]

const VALID_EXAM_TYPES = [
  'examen clinic general',
  'audiometrie',
  'spirometrie',
  'oftalmologie',
  'examen neurologic',
  'examen dermatologic',
  'examen psihologic',
]

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'api_key_missing' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.caenCode !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const caenCode = body.caenCode.trim().replace(/\s/g, '')
  if (!/^\d{4}$/.test(caenCode)) {
    return NextResponse.json({ error: 'invalid_caen_code' }, { status: 400 })
  }

  // Only CAEN code and optional description are sent — zero personal data.
  const caenDescription: string =
    typeof body.caenDescription === 'string' ? body.caenDescription.trim() : ''

  const systemPrompt = `Ești un expert în medicina muncii românesc specializat în evaluarea riscurilor conform HG 355/2007 și Legea 319/2006.
Răspunzi NUMAI în format JSON strict, fără text suplimentar, fără markdown, fără comentarii.`

  const userPrompt = `Analizează profilul de risc ocupațional pentru codul CAEN ${caenCode}${caenDescription ? ` — ${caenDescription}` : ''}.

Returnează exact acest JSON (fără alt text):
{
  "hazards": ["<cheie1>", "<cheie2>", ...],
  "intervalMonths": <6 sau 12>,
  "examinationTypes": ["<tip1>", ...],
  "rationale": "<frază scurtă în română>"
}

Reguli obligatorii:
- "hazards": selectează NUMAI din aceste chei exacte: ${ALL_VALID_HAZARD_KEYS.join(', ')}
  Maxim 8 chei, ordonate descrescător după relevanță pentru codul CAEN dat.
- "intervalMonths": 6 dacă există factori chimici majori, biologici sau radiații ionizante; altfel 12.
- "examinationTypes": selectează NUMAI din: ${VALID_EXAM_TYPES.join(', ')}
  Alege doar tipurile relevante pentru noxele identificate.
- "rationale": o frază scurtă (maxim 40 de cuvinte) în română explicând principalele riscuri.
- NU include date despre angajați, NU menționa persoane specifice.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Strip potential markdown code fences the model might add despite instructions.
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: {
      hazards: string[]
      intervalMonths: number
      examinationTypes: string[]
      rationale: string
    }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ error: 'parse_failed' }, { status: 500 })
    }

    // Sanitise: keep only recognised hazard keys and valid exam type names.
    const hazards = (parsed.hazards ?? []).filter((h) =>
      ALL_VALID_HAZARD_KEYS.includes(h)
    )
    const intervalMonths = [6, 12].includes(parsed.intervalMonths)
      ? parsed.intervalMonths
      : 12
    const examinationTypes = (parsed.examinationTypes ?? []).filter((e) =>
      VALID_EXAM_TYPES.includes(e.toLowerCase().trim())
    )
    const rationale =
      typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 300) : ''

    return NextResponse.json({ hazards, intervalMonths, examinationTypes, rationale })
  } catch {
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
  }
}

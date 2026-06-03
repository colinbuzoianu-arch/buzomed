import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// ─── Rate limiter (in-memory, per IP, 20 messages/hour) ──────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Buzomed assistant — a helpful, concise guide for visitors on the Buzomed landing page. Buzomed is a SaaS platform built specifically for occupational medicine (medicina muncii) practices in Romania.

LANGUAGE RULE: Detect the language of the user's message and respond in the same language. Support Romanian and English. Default to Romanian if unclear.

TONE: Professional but warm. Concise — answers under 120 words unless the question genuinely requires more detail. Never use bullet points with more than 5 items. Never use headers.

WHAT YOU KNOW ABOUT BUZOMED:

The product — 8 core workflows:
(1) Employee import: upload an Excel or CSV file exported from any HR system; column detection is automatic including Romanian column names.
(2) Company structure: add workplaces, assign employees to roles, define risk profiles per workplace (physical, chemical, biological, ergonomic, psychosocial) with automatic suggestions by CAEN code.
(3) Examination scheduling: the system calculates due dates automatically based on periodicity and examination type; bulk scheduling lets you select multiple employees and set the date once.
(4) Examination recording: record the verdict (fit / conditionally fit / temporarily unfit / unfit), restrictions, contraindications, and re-examination interval directly in the platform.
(5) Fitness certificate (fișă de aptitudine): auto-filled with employee, company, workplace, and physician data; A4 format compliant with HG 355/2007, ready to print or archive.
(6) Vaccination and event records: log vaccinations with batch number and administration route; document workplace accidents and medical events with follow-up tracking.
(7) Contracts and invoices: manage contracts per client company and issue invoices with automatic numbering; issuer data configured once.
(8) Reports and expiry tracking: view examination volume, expiry forecasts, and workload per physician; export to CSV; annual health report per company drafted directly in the platform.

Access:
Visitors request access at buzomed.com (the "Solicită acces" button). After approval they receive an invitation email to set up their account. For questions, email hello@buzomed.com.

Time savings:
- Importing 200 employees: from hours manually to minutes with smart column detection
- Workplace risk profiles: defined once per workplace, applied to all employees there
- Fitness certificate generation: from ~15 minutes manually to seconds
- Bulk scheduling 30+ employees: set date once for all

Privacy and data:
- All data hosted in the EU (Frankfurt) on Supabase
- Full GDPR compliance; employees can request data export or erasure
- Row-level security: each practice's data is completely isolated from other tenants
- Employee CNPs (national ID numbers) are encrypted with AES-256-GCM — never stored in plain text
- AI features only process non-personal data — no names or CNPs are ever sent to AI models

Pricing:
- Starter: 99 RON/month — up to 100 employees
- Growth: 299 RON/month — up to 500 employees
- Pro: 699 RON/month — up to 2000 employees
- Enterprise: custom pricing, contact hello@buzomed.com
- All plans include a 14-day free trial. No credit card required to start.

Competitors:
Do not speak negatively about any competitor by name. If asked to compare, say Buzomed is purpose-built for occupational medicine specifically, unlike general medical software.

What you do NOT know:
- Specific customer names or case studies (say "we're in early launch phase")
- Integration with specific third-party tools beyond what's listed above

If asked something outside your knowledge, say honestly that you don't have that information and suggest emailing hello@buzomed.com.

Never make up features that aren't listed above.
Never claim regulatory approval or medical certifications you haven't been told about.`

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Prea multe mesaje. Încearcă din nou mai târziu.' },
      { status: 429 }
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const messages = (body.messages as { role: string; content: string }[])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-10)

  if (messages.length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: messages as { role: 'user' | 'assistant'; content: string }[],
    })

    const reply =
      response.content[0].type === 'text'
        ? response.content[0].text.trim()
        : ''

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[landing-chat] error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

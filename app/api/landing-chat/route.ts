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

const SYSTEM_PROMPT = `You are the Buzomed assistant — a helpful, concise guide for visitors on the Buzomed landing page. Buzomed is a SaaS platform built specifically for occupational medicine (medicina muncii) practices in Romania, with expansion planned for Germany and Austria.

LANGUAGE RULE: Detect the language of the user's message and respond in the same language. Support Romanian, English, and German. Default to Romanian if unclear.

TONE: Professional but warm. Concise — answers under 100 words unless the question genuinely requires more detail. Never use bullet points with more than 4 items. Never use headers.

WHAT YOU KNOW ABOUT BUZOMED:

The product:
Buzomed has 7 core workflows: (1) company onboarding with per-workplace risk profiles and automatic ANAF data autofill from the company tax ID, (2) employee roster management with smart Excel import that works in Romanian, English, or German, (3) examination scheduling with an expiration dashboard showing who is due in the next 30 days, (4) examination forms that adapt to the workplace risk profile, (5) one-click bilingual fitness certificate PDF generation (Romanian + English, German coming soon) compliant with HG 355/2007, (6) contract-native invoicing with automatic VAT-exempt handling under Art. 292 of the Romanian Fiscal Code, (7) annual company health reports with AI-assisted narrative that reduces report writing from 4 hours to 15 minutes.

Visitors can register directly at buzomed.com and get immediate access. No credit card, no setup fee. For any questions before registering, they can write to hello@buzomed.com.

Time savings:
- Importing 200 employees: from 4 hours manually to 15 minutes
- Setting up workplace risk profiles: defined once per workplace, applied to all employees there — instead of entering it 200 times per employee
- Generating a fitness certificate (fișă de aptitudine): from 15 minutes manually to under 30 seconds
- Scheduling 30 examinations: from 45 minutes to 5 minutes
- Annual health report per company: from 4 hours to 15 minutes

Privacy and data:
- All data is hosted in Frankfurt, Germany (EU) on Supabase
- Full GDPR compliance
- Row-level security: each practice's data is completely isolated
- Employee CNPs (national ID numbers) are encrypted with AES-256-GCM
- AI features (hazard suggestions, report narratives) only process anonymized or non-personal data — no names or CNPs ever sent to AI
- Anthropic API is used for some AI features with Standard Contractual Clauses (SCC) for EU-US data transfers

Pricing:
Buzomed is currently free during the early access period. There are no fees, no credit card required, and no hidden costs at this stage. For any questions about future pricing or plans, direct the visitor to hello@buzomed.com.

Competitors:
Do not speak negatively about any competitor by name. If asked to compare, you can say Buzomed is purpose-built for occupational medicine specifically, unlike general medical software.

What you do NOT know:
- Specific customer names or case studies (say "we're in early launch phase")
- Exact launch date (say "available now")
- Integration with specific third-party tools beyond what's listed

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
      model: 'claude-sonnet-4-20250514',
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

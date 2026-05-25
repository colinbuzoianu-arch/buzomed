import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { asObject, requireString } from '@/lib/validation'

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 3
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

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
      { status: 429 }
    )
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}

  // Honeypot: legitimate users never fill this; bots almost always do.
  if (typeof body.website === 'string' && body.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  // Link-spam: more than 2 URLs in the message is a near-certain bot signal.
  if (typeof body.message === 'string') {
    const linkCount = (body.message.match(/https?:\/\//gi) ?? []).length
    if (linkCount > 2) {
      return NextResponse.json({ success: true })
    }
  }

  const issues: string[] = []

  const name = requireString('name', body.name, issues, { maxLength: 1000 })
  const email = requireString('email', body.email, issues, { maxLength: 1000 })
  const subject = requireString('subject', body.subject, issues, { maxLength: 1000 })
  const message = requireString('message', body.message, issues, { maxLength: 1000 })

  if (issues.length > 0) {
    return NextResponse.json({ error: issues[0] }, { status: 400 })
  }

  const safeName = name as string
  const safeEmail = (email as string).toLowerCase()
  const safeSubject = subject as string
  const safeMessage = message as string

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    return NextResponse.json({ error: 'Adresa de email nu este validă.' }, { status: 400 })
  }

  if (safeSubject.length < 3) {
    return NextResponse.json(
      { error: 'Subiectul trebuie să aibă cel puțin 3 caractere.' },
      { status: 400 }
    )
  }

  if (safeMessage.length < 10) {
    return NextResponse.json(
      { error: 'Mesajul trebuie să aibă cel puțin 10 caractere.' },
      { status: 400 }
    )
  }

  // Send notification to hello@buzomed.com
  const notifyResult = await sendEmail({
    to: { email: 'hello@buzomed.com', name: 'Buzomed' },
    content: {
      subject: `[Buzomed Contact] ${safeSubject} — ${safeName}`,
      html: `
<h2>Mesaj nou prin formularul de contact</h2>
<p><strong>Nume:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
<p><strong>Subiect:</strong> ${safeSubject}</p>
<hr>
<p>${safeMessage.replace(/\n/g, '<br>')}</p>
<hr>
<p><small>Trimis de pe buzomed.com/contact</small></p>
      `.trim(),
      text: `Mesaj nou prin formularul de contact\nNume: ${safeName}\nEmail: ${safeEmail}\nSubiect: ${safeSubject}\n\n${safeMessage}\n\nTrimis de pe buzomed.com/contact`,
    },
    replyTo: { email: safeEmail, name: safeName },
    tags: ['contact-form'],
  })

  if (!notifyResult.success) {
    console.error('[contact] Failed to send notification email:', notifyResult.error)
    return NextResponse.json(
      { error: 'Nu am putut trimite mesajul. Încearcă din nou sau scrie direct la hello@buzomed.com.' },
      { status: 500 }
    )
  }

  // Send auto-reply to sender (non-fatal if it fails)
  const autoReplyResult = await sendEmail({
    to: { email: safeEmail, name: safeName },
    content: {
      subject: 'Am primit mesajul dumneavoastră — Buzomed',
      html: `
<p>Bună ziua, ${safeName},</p>
<p>Am primit mesajul dumneavoastră și vă vom răspunde în 24-48 de ore lucrătoare.</p>
<p>Dacă aveți o urgență, scrieți direct la <a href="mailto:hello@buzomed.com">hello@buzomed.com</a>.</p>
<br>
<p>Cu stimă,<br>Echipa Buzomed</p>
      `.trim(),
      text: `Bună ziua, ${safeName},\n\nAm primit mesajul dumneavoastră și vă vom răspunde în 24-48 de ore lucrătoare.\n\nDacă aveți o urgență, scrieți direct la hello@buzomed.com.\n\nCu stimă,\nEchipa Buzomed`,
    },
    tags: ['contact-autoreply'],
  })

  if (!autoReplyResult.success) {
    console.error('[contact] Auto-reply failed (non-fatal):', autoReplyResult.error)
  }

  return NextResponse.json({ success: true })
}

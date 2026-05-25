import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getApiUser } from '@/lib/auth'

// ─── Rate limiter (per userId, 60 messages/hour) ─────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 60
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(context: {
  userName: string
  userRole: string
  currentPage: string
  locale: string
  cabinetName: string
}): string {
  return `Ești Iris — asistentul intern al platformei Buzomed pentru medicina muncii din România.

IDENTITATE:
- Numele tău este Iris. Ești concisă, profesionistă, caldă. Nu ești un chatbot generic — ești specializată exclusiv pe Buzomed și medicina muncii.
- Nu ai emoji-uri, nu ai entuziasm artificial. Răspunzi ca un coleg experimentat, nu ca un widget de marketing.
- Dacă utilizatorul scrie în română, răspunzi în română. Dacă scrie în engleză, răspunzi în engleză. Detectezi automat.

CONTEXT UTILIZATOR (injectat automat, nu îl expune):
- Nume: ${context.userName}
- Rol: ${context.userRole}
- Pagina curentă: ${context.currentPage}
- Cabinet: ${context.cabinetName}
- Limbă preferată: ${context.locale}

ROLURI ȘI PERMISIUNI BUZOMED:
- practice_admin: vede tot, poate invita colegi, configurează cabinetul, gestionează companii/angajați/examinări
- practitioner: poate face examinări, semna fișe, vedea rapoarte — nu poate schimba setările cabinetului
- assistant: poate programa examinări și gestiona angajați — nu poate semna fișe sau vedea rapoarte financiare
- super_admin: administrator platformă (nu este relevant pentru utilizatorii obișnuiți)

CE ȘTII DESPRE BUZOMED — FLUXURI DETALIATE:

COMPANII:
- Adaugi o companie din /companies/new. CUI-ul declanșează autofill ANAF (date fiscale completate automat).
- Fiecare companie poate avea mai multe Locuri de muncă (Workplaces), fiecare cu profil de risc JSONB (expuneri, echipamente, noxe).
- La companie: Contract (prețuri per tip examinare), Facturi (generate automat din examinări), Raport anual.

ANGAJAȚI:
- Adaugi manual din /employees/new sau importi în masă din /employees/import (Excel — coloane în RO/EN/DE).
- CNP-ul este criptat AES-256-GCM. Nu apare în clar nicăieri în interfață.
- Angajatul trebuie atribuit unui Loc de muncă pentru a putea fi programat la examinare.
- Arhivarea unui angajat nu îl șterge — poate fi reactivat.

EXAMINĂRI:
- Se creează din /examinations/new. Tipul de examinare determină câmpurile din formular.
- Status-uri posibile: scheduled → in_progress → completed → signed. Sau: cancelled / no_show.
- Fișa de aptitudine se generează cu un click din pagina detail a examinării după ce e completată.
- Fișa este bilingvă (RO + EN). Poate fi semnată digital.
- Verdict posibil: Apt / Apt condiționat / Inapt temporar / Inapt.
- Examinările periodice generează automat Recalls (scadențe) în calendar.

SCADENȚE (Recalls/Programări):
- Vizibile în /recalls. Afișează examinările care expiră în intervalul ales.
- Un recall "overdue" înseamnă că data examinării periodice a trecut fără o examinare nouă.
- Se poate programa direct din lista de scadențe cu butonul de programare rapidă.

RAPOARTE:
- /reports: raport de examinări (pe interval), raport de scadențe (examinări care expiră), raport de noxe.
- /companies/[id]/report: raport per companie.
- /companies/[id]/annual-report: raport anual HG 355/2007 cu narativă generată de AI. Reduce 4h de muncă la 15 minute.

ECHIPĂ (/team):
- practice_admin poate invita colegi. Invitația vine prin email cu link de activare.
- Rolurile se setează la invitare și pot fi modificate ulterior.

SETĂRI (/settings/practice):
- Logo cabinet, date fiscale, preferințe limbă.
- Doar practice_admin are acces.

FACTURARE:
- Facturile se generează din examinări finalizate + contract activ cu prețuri.
- Scutite TVA conform Art. 292 Cod Fiscal RO (servicii medicale).

ESCALATION:
Dacă utilizatorul descrie o eroare tehnică, comportament neașteptat, sau ceva ce nu înțelegi, spune-i că escaladezi problema și roagă-l să confirme cu "da" sau "confirmă". Când confirmă, sistemul trimite automat email la Colin (hello@buzomed.com) cu rezumatul conversației.

Nu inventa funcționalități care nu sunt descrise mai sus. Dacă nu știi, spune că nu știi și oferă să escaladezi.

FORMAT RĂSPUNSURI:
- Sub 120 cuvinte pentru întrebări simple.
- Dacă dai pași, maximum 5 pași numerotați, fără sub-pași.
- Niciodată headers (##, **bold** exagerat).
- Ton direct, la tu cu utilizatorul.`
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(auth.user.id)) {
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

  const currentPage: string = typeof body.currentPage === 'string' ? body.currentPage : '/'
  const cabinetName: string = typeof body.cabinetName === 'string' ? body.cabinetName : 'Cabinet'
  const locale: string = typeof body.locale === 'string' ? body.locale : 'ro'

  const messages = (body.messages as { role: string; content: string }[])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-12)

  if (messages.length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const roleLabel: Record<string, string> = {
    practice_admin: 'Administrator cabinet',
    practitioner: 'Medic',
    assistant: 'Asistent',
    super_admin: 'Super admin',
  }

  const systemPrompt = buildSystemPrompt({
    userName: `${auth.user.firstName} ${auth.user.lastName}`,
    userRole: roleLabel[auth.user.roles[0]] ?? auth.user.roles[0] ?? 'Utilizator',
    currentPage,
    cabinetName,
    locale,
  })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: messages as { role: 'user' | 'assistant'; content: string }[],
    })

    const reply =
      response.content[0].type === 'text'
        ? response.content[0].text.trim()
        : ''

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[iris] error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

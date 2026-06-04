import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NavBar } from '@/components/landing/NavBar'
import { LandingChat } from '@/components/landing/LandingChat'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Buzomed — Medicina muncii, digitalizat',
  description:
    'Software pentru cabinete de medicina muncii. Gestionați angajați, programați examinări și generați documente automat.',
}

// ── Workflow card icons (inline SVG, no icon library dependency) ───────────

function Icon01() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}

function Icon02() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  )
}

function Icon03() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
    </svg>
  )
}

function Icon04() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  )
}

function Icon05() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function Icon06() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8H8M16 12H8M12 16H8" />
    </svg>
  )
}

function Icon07() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function Icon08() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={22} height={22}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}

// ── Static content ─────────────────────────────────────────────────────────

const workflowCards = [
  {
    num: '01',
    Icon: Icon01,
    title: 'Importați angajații',
    body: 'Încărcați un fișier Excel sau CSV exportat din sistemul vostru HR. Detectarea coloanelor este automată — inclusiv pentru denumiri românești ambigue.',
  },
  {
    num: '02',
    Icon: Icon02,
    title: 'Structurați companiile',
    body: 'Adăugați locuri de muncă, alocați angajații pe posturi și definiți profilul de riscuri per loc de muncă (fizice, chimice, biologice, ergonomice, psihosociale) cu sugestii automate pe cod CAEN.',
  },
  {
    num: '03',
    Icon: Icon03,
    title: 'Programați examinările',
    body: 'Sistemul calculează automat scadențele în funcție de periodicitate și tipul examinării. Programarea în masă permite selectarea mai multor angajați și setarea datei o singură dată.',
  },
  {
    num: '04',
    Icon: Icon04,
    title: 'Efectuați examinarea',
    body: 'Completați verdictul (apt / apt condiționat / inapt temporar / inapt), restricțiile, contraindicațiile și intervalul de reexaminare direct în platformă.',
  },
  {
    num: '05',
    Icon: Icon05,
    title: 'Generați fișa de aptitudine',
    body: 'Fișa se completează automat cu datele angajatului, companiei, locului de muncă și medicului. Format A4, conform HG 355/2007, gata de tipărit sau arhivat.',
  },
  {
    num: '06',
    Icon: Icon07,
    title: 'Evidența vaccinărilor și evenimentelor',
    body: 'Înregistrați vaccinările cu numărul de lot și calea de administrare. Documentați accidentele de muncă și evenimentele medicale cu urmărirea evoluției.',
  },
  {
    num: '07',
    Icon: Icon06,
    title: 'Contracte și facturi',
    body: 'Gestionați contractele per companie clientă și emiteți facturi cu numerotare automată. Datele emitentului se configurează o singură dată.',
  },
  {
    num: '08',
    Icon: Icon08,
    title: 'Rapoarte și scadențe',
    body: 'Vizualizați volumul de examinări, prognoza scadențelor și încărcarea per medic. Exportați în CSV. Raportul anual per companie se redactează direct în platformă.',
  },
]

const tableRows = [
  { name: 'Andrei M.', role: 'Operator',  status: 'Apt',     date: '14 mai 2026', color: '#4ade80' },
  { name: 'Elena P.',  role: 'Tehnician', status: 'Scadent', date: '02 iun 2026', color: '#fbbf24' },
  { name: 'Mihai D.',  role: 'Manager',   status: 'Apt',     date: '28 apr 2026', color: '#4ade80' },
  { name: 'Ioana S.',  role: 'Contabil',  status: 'Expirat', date: '15 mar 2026', color: '#f87171' },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const user = await getCurrentUser()
  if (user) {
    if (user.roles.includes('super_admin')) redirect('/super-admin')
    if (user.roles.includes('company_hr') && !user.roles.some(r => r !== 'company_hr')) {
      redirect('/hr-portal/dashboard')
    }
    redirect('/dashboard')
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <NavBar />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          minHeight: '92vh',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          src="/buzomed_picture.png"
          alt=""
          fill
          priority
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(135deg, rgba(15,31,58,0.85) 0%, rgba(30,77,139,0.60) 100%)',
          }}
        />
        <div
          className="max-w-7xl mx-auto px-6 xl:px-12"
          style={{ position: 'relative', zIndex: 1, width: '100%' }}
        >
          <div style={{ maxWidth: 620 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 100,
                padding: '6px 14px',
                marginBottom: 28,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#4ade80',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: 500 }}>
                Software dedicat medicinei muncii
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(36px, 5vw, 58px)',
                fontWeight: 800,
                lineHeight: 1.1,
                color: 'white',
                letterSpacing: '-0.02em',
                marginBottom: 20,
              }}
            >
              Software construit pentru{' '}
              <span style={{ color: '#7dd3fc' }}>medicina muncii.</span>
            </h1>

            <p
              style={{
                fontSize: 18,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.80)',
                marginBottom: 40,
                maxWidth: 500,
              }}
            >
              Gestionați angajați, programați examinări, generați fișe de aptitudine și primiți
              notificări automate — totul dintr-o singură platformă.
            </p>

            <Link href="/contact" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  background: '#1E4D8B',
                  color: 'white',
                  padding: '14px 32px',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 16,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 24px rgba(30,77,139,0.45)',
                }}
              >
                Solicită acces →
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────── */}
      <section style={{ background: 'white', padding: '96px 24px' }}>
        <div className="max-w-7xl mx-auto">
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p
              style={{
                color: '#1E4D8B',
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Provocările actuale
            </p>
            <h2
              style={{
                fontSize: 'clamp(26px, 3.5vw, 38px)',
                fontWeight: 800,
                color: '#0F1F3A',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Ce îngreunează munca în cabinetele
              <br />
              de medicina muncii?
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 24,
            }}
          >
            {[
              {
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={26} height={26}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                ),
                title: 'Soluții software nepotrivite pentru medicina muncii',
                body: 'Soluțiile existente au fost construite pentru medicina generală și au acumulat zeci de funcții pe care un cabinet de medicina muncii nu le folosește niciodată. Rezultatul: interfețe aglomerate, fluxuri complicate, și timp pierdut zilnic cu un instrument care nu a fost gândit pentru tine.',
              },
              {
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={26} height={26}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                ),
                title: 'Fișe generate manual',
                body: 'Fișa de aptitudine se completează câmp cu câmp, se verifică, se exportă, se trimite, se arhivează separat. Pentru fiecare angajat, de fiecare dată. Într-un cabinet cu sute de examinări pe lună, aceasta înseamnă ore întregi de muncă administrativă care nu aduce nicio valoare medicală.',
              },
              {
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={26} height={26}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                ),
                title: 'Procese complicate de introducere a datelor',
                body: 'Aceeași informație introdusă în mai multe locuri. Caracteristicile locului de muncă copiate de la un angajat la altul. Liste de angajați actualizate manual când o firmă adaugă sau renunță la personal. Fiecare schimbare în structura unei firme cliente se traduce în zeci de modificări în software.',
              },
            ].map((col) => (
              <div
                key={col.title}
                style={{
                  background: '#F8FAFC',
                  borderRadius: 16,
                  padding: '32px 28px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 14,
                    background: 'rgba(30,77,139,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1E4D8B',
                    marginBottom: 18,
                  }}
                >
                  {col.svg}
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: '#0F1F3A', marginBottom: 10 }}>
                  {col.title}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: '#64748B' }}>{col.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflows ────────────────────────────────────── */}
      <section style={{ background: '#F8FAFC', padding: '96px 24px' }}>
        <div className="max-w-7xl mx-auto">
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p
              style={{
                color: '#1E4D8B',
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Funcționalități
            </p>
            <h2
              style={{
                fontSize: 'clamp(26px, 3.5vw, 38px)',
                fontWeight: 800,
                color: '#0F1F3A',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
              }}
            >
              Tot ce aveți nevoie,
              <br />
              într-un singur loc
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {workflowCards.map((card) => (
              <div
                key={card.num}
                style={{
                  background: 'white',
                  borderRadius: 14,
                  padding: '24px 22px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(30,77,139,0.07)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1E4D8B',
                    }}
                  >
                    <card.Icon />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#CBD5E1',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {card.num}
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F1F3A', marginBottom: 8 }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#64748B' }}>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── App Preview ──────────────────────────────────── */}
      <section style={{ background: '#0F1F3A', padding: '96px 24px', overflow: 'hidden' }}>
        <div className="max-w-7xl mx-auto">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2
              style={{
                fontSize: 'clamp(26px, 3.5vw, 38px)',
                fontWeight: 800,
                color: 'white',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                marginBottom: 14,
              }}
            >
              Interfață simplă, flux clar
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', maxWidth: 440, margin: '0 auto' }}>
              Proiectat pentru medicii de medicina muncii, nu pentru IT.
            </p>
          </div>

          {/* Browser chrome mockup */}
          <div
            style={{
              maxWidth: 860,
              margin: '0 auto',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Title bar */}
            <div
              style={{
                background: '#1E293B',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FFBD2E' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840' }} />
              <div
                style={{
                  flex: 1,
                  margin: '0 12px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 6,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 12,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12 }}>
                  app.buzomed.com/employees
                </span>
              </div>
            </div>

            {/* App body */}
            <div style={{ background: '#0F172A', display: 'flex', minHeight: 340 }}>
              {/* Sidebar */}
              <div
                style={{
                  width: 52,
                  background: '#1E293B',
                  borderRight: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 16,
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: i === 1 ? '#1E4D8B' : 'rgba(255,255,255,0.05)',
                    }}
                  />
                ))}
              </div>

              {/* Main content */}
              <div style={{ flex: 1, padding: '20px 24px', minWidth: 0 }}>
                {/* Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    marginBottom: 24,
                  }}
                >
                  {[
                    { label: 'Angajați activi',        value: '247', color: '#7dd3fc' },
                    { label: 'Examinări luna aceasta',  value: '38',  color: '#86efac' },
                    { label: 'Scadențe apropiate',      value: '12',  color: '#fcd34d' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div
                        style={{ fontSize: 22, fontWeight: 700, color: stat.color, marginBottom: 2 }}
                      >
                        {stat.value}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.3 }}>
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1fr 1.2fr',
                    gap: 8,
                    padding: '0 10px',
                    marginBottom: 6,
                  }}
                >
                  {['Angajat', 'Post', 'Status', 'Examinare'].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.28)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Table rows */}
                {tableRows.map((row) => (
                  <div
                    key={row.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.5fr 1fr 1.2fr',
                      gap: 8,
                      padding: '9px 10px',
                      borderRadius: 8,
                      marginBottom: 4,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', fontWeight: 500 }}>
                      {row.name}
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{row.role}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.color }}>{row.status}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{row.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #1E4D8B 0%, #163d70 100%)',
          padding: '96px 24px',
          textAlign: 'center',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <h2
            style={{
              fontSize: 'clamp(26px, 3.5vw, 40px)',
              fontWeight: 800,
              color: 'white',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            Pregătiți să digitalizați cabinetul?
          </h2>
          <p
            style={{
              fontSize: 18,
              color: 'rgba(255,255,255,0.72)',
              maxWidth: 460,
              margin: '0 auto 40px',
              lineHeight: 1.6,
            }}
          >
            Creați un cont gratuit și configurați primul cabinet în câteva minute.
          </p>
          <Link href="/contact" style={{ textDecoration: 'none' }}>
            <button
              style={{
                background: 'white',
                color: '#1E4D8B',
                padding: '14px 36px',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 16,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              }}
            >
              Solicită acces →
            </button>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer
        style={{
          background: '#0A1628',
          padding: '36px 24px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div
          className="max-w-7xl mx-auto"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image src="/buzomed-icon.png" width={22} height={22} alt="Buzomed" />
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: 500 }}>
              buzomed
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: 13 }}>
            © 2026 Buzomed. Toate drepturile rezervate.
          </p>
          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13, textDecoration: 'none' }}>Confidențialitate</Link>
            <Link href="/terms" style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13, textDecoration: 'none' }}>Termeni</Link>
            <Link href="/contact" style={{ color: 'rgba(255,255,255,0.40)', fontSize: 13, textDecoration: 'none' }}>Contact</Link>
          </div>
        </div>
      </footer>

      <LandingChat />
    </div>
  )
}

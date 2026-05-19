import Image from 'next/image'
import Link from 'next/link'

function Nav() {
  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Image src="/buzomed-icon.png" width={28} height={28} alt="Buzomed" />
          <span style={{ fontWeight: 600, fontSize: 18, color: '#0F1F3A', letterSpacing: '-0.01em' }}>
            buzomed
          </span>
        </Link>
      </div>
    </nav>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 18, fontWeight: 600, color: '#0F1F3A',
      marginTop: 40, marginBottom: 12,
      borderLeft: '3px solid #2BA39A', paddingLeft: 12,
    }}>
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.8, marginBottom: 12 }}>
      {children}
    </p>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ fontSize: 16, color: '#374151', lineHeight: 1.8 }}>{children}</li>
  )
}

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: 'Inter, sans-serif' }}>
      <Nav />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F1F3A', marginBottom: 8 }}>
          Termeni și Condiții
        </h1>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 48 }}>Ultima actualizare: Mai 2026</p>

        <P>
          Acești termeni guvernează utilizarea platformei Buzomed, operată de Verumsell SRL
          (&ldquo;Buzomed&rdquo;, &ldquo;noi&rdquo;). Prin crearea unui cont, acceptați acești termeni.
        </P>

        <H2>1. Serviciul</H2>
        <P>
          Buzomed este o platformă SaaS de gestiune pentru cabinete de medicină a muncii. Oferim acces la
          funcționalitățile platformei în schimbul respectării acestor termeni.
        </P>

        <H2>2. Eligibilitate</H2>
        <P>Platforma este destinată exclusiv:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Medicilor de medicina muncii autorizați</Li>
          <Li>Personalului administrativ al cabinetelor de medicina muncii</Li>
          <Li>Administratorilor de clinici cu profil de medicina muncii</Li>
        </ul>

        <H2>3. Contul dumneavoastră</H2>
        <P>Sunteți responsabil pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Păstrarea confidențialității credențialelor de acces</Li>
          <Li>Toate acțiunile efectuate din contul dumneavoastră</Li>
          <Li>Acuratețea datelor introduse în platformă</Li>
        </ul>
        <P>
          Buzomed nu poate fi tras la răspundere pentru prejudicii cauzate de compromiterea contului din culpa
          utilizatorului.
        </P>

        <H2>4. Responsabilități medicale</H2>
        <P>
          <strong>Important:</strong> Buzomed este un instrument de gestiune administrativă. Platforma nu oferă și nu
          înlocuiește consultul medical sau decizia clinică.
        </P>
        <P>Responsabilitatea pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Verdictul de aptitudine (apt/inapt)</Li>
          <Li>Conținutul fișelor de aptitudine semnate</Li>
          <Li>Recomandările medicale</Li>
        </ul>
        <P>
          aparține exclusiv medicului utilizator, în conformitate cu legislația română aplicabilă (Legea 95/2006,
          HG 355/2007).
        </P>
        <P>
          Funcționalitățile AI ale platformei oferă sugestii orientative. Decizia finală aparține întotdeauna
          medicului.
        </P>

        <H2>5. Date și confidențialitate</H2>
        <P>
          Utilizarea platformei implică prelucrarea de date cu caracter personal și date medicale. Prin utilizarea
          platformei, confirmați că:
        </P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Aveți temeiul legal pentru prelucrarea datelor angajaților firmelor cliente</Li>
          <Li>Ați informat angajații conform GDPR</Li>
          <Li>Respectați legislația aplicabilă medicinii muncii</Li>
        </ul>
        <P>
          Verumsell SRL acționează ca procesator de date în relația cu cabinetul dumneavoastră, conform{' '}
          <Link href="/privacy" style={{ color: '#2BA39A' }}>Politicii de Confidențialitate</Link>.
        </P>

        <H2>6. Utilizare acceptabilă</H2>
        <P>Este interzisă utilizarea platformei pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Introducerea de date false sau fabricate</Li>
          <Li>Accesarea datelor altor cabinete</Li>
          <Li>Orice activitate ilegală sau contrară eticii medicale</Li>
          <Li>Revânzarea sau redistribuirea accesului</Li>
        </ul>

        <H2>7. Disponibilitate</H2>
        <P>
          Ne străduim să menținem platforma disponibilă 24/7. Nu garantăm disponibilitatea neîntreruptă și nu
          răspundem pentru prejudicii cauzate de întreruperi tehnice planificate sau neplanificate.
        </P>

        <H2>8. Modificări ale serviciului</H2>
        <P>
          Ne rezervăm dreptul de a modifica sau întrerupe funcționalități ale platformei. Modificările semnificative
          vor fi comunicate cu cel puțin 14 zile înainte.
        </P>

        <H2>9. Prețuri și facturare</H2>
        <P>
          Condițiile comerciale actuale sunt comunicate la înregistrare și pot fi modificate cu notificare prealabilă
          de 30 de zile.
        </P>

        <H2>10. Încetarea utilizării</H2>
        <P>
          Puteți închide contul oricând contactând{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>. Datele vor fi tratate
          conform Politicii de Confidențialitate.
        </P>
        <P>Ne rezervăm dreptul de a suspenda conturile care încalcă acești termeni.</P>

        <H2>11. Limitarea răspunderii</H2>
        <P>
          În măsura permisă de lege, răspunderea Verumsell SRL este limitată la sumele plătite pentru serviciu în
          ultimele 12 luni.
        </P>

        <H2>12. Legea aplicabilă</H2>
        <P>
          Acești termeni sunt guvernați de legea română. Orice litigiu va fi soluționat de instanțele competente din
          România.
        </P>

        <H2>13. Contact</H2>
        <P>
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>
        </P>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
          <Link href="/" style={{ color: '#2BA39A', fontSize: 14, textDecoration: 'none' }}>
            ← Înapoi la buzomed.com
          </Link>
        </div>
      </div>
    </div>
  )
}

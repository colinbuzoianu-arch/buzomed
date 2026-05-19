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

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: 'Inter, sans-serif' }}>
      <Nav />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F1F3A', marginBottom: 8 }}>
          Politică de Confidențialitate
        </h1>
        <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 48 }}>Ultima actualizare: Mai 2026</p>

        <P>
          Această politică de confidențialitate descrie modul în care Verumsell SRL (&ldquo;noi&rdquo;,
          &ldquo;Buzomed&rdquo;) colectează, utilizează și protejează datele dumneavoastră personale în cadrul
          platformei Buzomed (buzomed.com).
        </P>

        <H2>1. Cine suntem</H2>
        <P>Operatorul de date cu caracter personal este:</P>
        <P>
          <strong>Verumsell SRL</strong><br />
          Email:{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>
        </P>
        <P>Platforma Buzomed este un software de gestiune destinat cabinetelor de medicină a muncii din România.</P>

        <H2>2. Ce date colectăm</H2>
        <P><strong>Date de cont:</strong><br />
          Nume, prenume, adresă de email, numele cabinetului, orașul — colectate la înregistrare.</P>
        <P><strong>Date profesionale:</strong><br />
          Titlu profesional, cod de parafă, semnătură digitală și ștampilă — opționale, furnizate de utilizator.</P>
        <P><strong>Date despre angajații firmelor cliente:</strong><br />
          Nume, prenume, CNP (stocat criptat AES-256-GCM), dată de naștere, gen, loc de muncă, rezultatele
          examinărilor medicale ocupaționale. Aceste date sunt introduse de medicii utilizatori ai platformei în
          exercitarea activității lor profesionale.</P>
        <P><strong>Date de utilizare:</strong><br />
          Adresă IP (hashată), timestamp-uri de autentificare, acțiuni efectuate în platformă — utilizate pentru
          securitate și audit.</P>
        <P><strong>Date din chatbot-ul de pe pagina de prezentare:</strong><br />
          Mesajele trimise asistentului AI de pe buzomed.com sunt salvate în formă anonimizată (fără nume, fără
          email) exclusiv pentru îmbunătățirea serviciului.</P>

        <H2>3. Cum utilizăm datele</H2>
        <P>Utilizăm datele pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Furnizarea și îmbunătățirea serviciilor platformei</Li>
          <Li>Trimiterea de emailuri tranzacționale (activare cont, notificări)</Li>
          <Li>Asigurarea securității și integrității platformei</Li>
          <Li>Respectarea obligațiilor legale</Li>
        </ul>
        <P>Nu vindem, nu închiriem și nu transferăm datele dumneavoastră către terți în scopuri comerciale.</P>

        <H2>4. Temeiul legal (GDPR)</H2>
        <P>Prelucrăm datele în baza următoarelor temeiuri legale:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li><strong>Executarea contractului</strong> (Art. 6(1)(b) GDPR) — pentru datele de cont și utilizare a platformei</Li>
          <Li><strong>Obligație legală</strong> (Art. 6(1)(c) GDPR) — pentru datele necesare conformității cu legislația muncii și sănătății ocupaționale</Li>
          <Li><strong>Interese legitime</strong> (Art. 6(1)(f) GDPR) — pentru securitatea platformei și prevenirea fraudei</Li>
        </ul>
        <P>
          Datele despre sănătatea angajaților sunt date speciale conform Art. 9 GDPR și sunt prelucrate exclusiv în
          contextul medicinii muncii, cu respectarea legislației aplicabile (Legea 319/2006, HG 355/2007).
        </P>

        <H2>5. Unde sunt stocate datele</H2>
        <P>
          Toate datele sunt stocate pe servere situate în <strong>Frankfurt, Germania (UE)</strong>, prin intermediul
          Supabase Inc. (furnizor de infrastructură cloud).
        </P>
        <P>Transferul de date în afara UE nu are loc pentru datele principale ale platformei.</P>

        <H2>6. Funcționalități AI și date personale</H2>
        <P>
          Platforma Buzomed utilizează servicii de inteligență artificială (Anthropic Claude API) pentru anumite
          funcționalități specifice. Politica noastră strictă:
        </P>
        <P><strong>Ce NU trimitem niciodată la AI:</strong></P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Nume sau prenume ale angajaților</Li>
          <Li>CNP-uri sau orice identificator personal</Li>
          <Li>Date de contact individuale</Li>
        </ul>
        <P><strong>Ce trimitem la AI (exclusiv date anonimizate):</strong></P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Cod CAEN al firmei (pentru sugestii de profil de risc)</Li>
          <Li>Valori medicale anonimizate (vârstă aproximativă, gen, valori numerice) fără identificatori — pentru rezumatul istoricului de examinări</Li>
          <Li>Statistici agregate per firmă — pentru generarea narativei raportului anual</Li>
          <Li>Header-uri de coloane Excel — pentru maparea automată la import (nu datele efective)</Li>
        </ul>
        <P>
          Anthropic Inc. procesează aceste date în conformitate cu Standard Contractual Clauses (SCC) pentru transferuri
          UE-SUA și nu utilizează datele din API pentru antrenarea modelelor.
        </P>

        <H2>7. CNP-uri — protecție specială</H2>
        <P>
          CNP-urile angajaților sunt criptate cu AES-256-GCM înainte de stocare. Cheia de criptare este separată de
          baza de date. CNP-ul în clar nu este niciodată stocat și nu este niciodată trimis către servicii externe,
          inclusiv AI.
        </P>

        <H2>8. Izolarea datelor între cabinete</H2>
        <P>
          Platforma utilizează Row Level Security (RLS) la nivel de bază de date. Datele unui cabinet sunt complet
          izolate de datele altor cabinete — este imposibil tehnic ca un utilizator al unui cabinet să acceseze datele
          altui cabinet.
        </P>

        <H2>9. Cât timp păstrăm datele</H2>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Date de cont activ: pe durata utilizării platformei</Li>
          <Li>Date despre examinări: minim 7 ani conform legislației muncii din România (HG 355/2007)</Li>
          <Li>Date de audit și loguri: 12 luni</Li>
          <Li>Date din chatbot (anonimizate): 24 luni</Li>
        </ul>
        <P>
          La ștergerea contului, datele personale identificabile sunt șterse în termen de 30 de zile. Datele medicale
          pot fi reținute conform obligațiilor legale.
        </P>

        <H2>10. Drepturile dumneavoastră (GDPR)</H2>
        <P>Aveți dreptul la:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li><strong>Acces</strong> — să solicitați o copie a datelor deținute</Li>
          <Li><strong>Rectificare</strong> — corectarea datelor inexacte</Li>
          <Li><strong>Ștergere</strong> — în limitele obligațiilor legale</Li>
          <Li><strong>Restricționare</strong> — limitarea prelucrării</Li>
          <Li><strong>Portabilitate</strong> — exportul datelor în format lizibil de mașină</Li>
          <Li><strong>Opoziție</strong> — față de prelucrarea bazată pe interese legitime</Li>
        </ul>
        <P>
          Pentru exercitarea acestor drepturi, contactați:{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>
        </P>
        <P>
          Aveți de asemenea dreptul de a depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării
          Datelor cu Caracter Personal (ANSPDCP):{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" style={{ color: '#2BA39A' }}>
            www.dataprotection.ro
          </a>
        </P>

        <H2>11. Cookie-uri</H2>
        <P>
          Buzomed utilizează exclusiv cookie-uri funcționale necesare autentificării și funcționării platformei. Nu
          utilizăm cookie-uri de tracking sau publicitate.
        </P>

        <H2>12. Modificări ale politicii</H2>
        <P>
          Orice modificare semnificativă va fi comunicată prin email utilizatorilor activi cu cel puțin 14 zile înainte
          de intrarea în vigoare.
        </P>

        <H2>13. Contact</H2>
        <P>
          Pentru orice întrebare legată de confidențialitate:<br />
          <strong>Email:</strong>{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a><br />
          <strong>Răspuns:</strong> în termen de 72 de ore lucrătoare
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

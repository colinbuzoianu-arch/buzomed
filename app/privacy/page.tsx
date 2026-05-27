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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#F0FBF9', border: '1px solid #2BA39A33',
      borderRadius: 8, padding: '16px 20px', marginBottom: 16,
    }}>
      {children}
    </div>
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
          &ldquo;Buzomed&rdquo;) colectează, utilizează și protejează datele cu caracter personal în cadrul
          platformei Buzomed (buzomed.com), în conformitate cu Regulamentul (UE) 2016/679 (GDPR) și
          Legea nr. 190/2018 privind măsurile de punere în aplicare a GDPR în România.
        </P>

        <H2>1. Cine suntem</H2>
        <P>
          <strong>Verumsell SRL</strong> este societatea care dezvoltă și operează platforma Buzomed.<br />
          Email: <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>
        </P>
        <P>Platforma Buzomed este un software de gestiune destinat cabinetelor de medicină a muncii din România.</P>

        <H2>2. Rolurile noastre în raport cu datele — Operator vs. Procesator (Art. 28 GDPR)</H2>
        <P>
          Buzomed acționează în două calități distincte, în funcție de categoria de date prelucrate:
        </P>
        <InfoBox>
          <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.7, margin: 0 }}>
            <strong>Operator independent</strong> — pentru datele utilizatorilor platformei (conturi, acces, securitate):<br />
            Verumsell SRL determină scopurile și mijloacele prelucrării datelor de înregistrare și de utilizare a platformei.
            Temeiul legal: Art. 6(1)(b) GDPR (executarea contractului).
          </p>
        </InfoBox>
        <InfoBox>
          <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.7, margin: 0 }}>
            <strong>Procesator de date (împuternicit)</strong> — pentru datele medicale ale angajaților introduse în platformă:<br />
            Cabinetul de medicină a muncii (Clientul) este <strong>Operatorul</strong> datelor angajaților firmelor sale cliente.
            Verumsell SRL acționează ca <strong>Procesator</strong> (împuternicit al operatorului) în conformitate cu Art. 28 GDPR,
            prelucrând aceste date exclusiv în baza instrucțiunilor Clientului și în scopul furnizării serviciului contractat.
          </p>
        </InfoBox>
        <P>
          Relația de procesator este reglementată prin Acordul de Prelucrare a Datelor (DPA) inclus în Termenii
          și Condițiile de Utilizare acceptați la activarea contului. Cabinetul rămâne responsabil față de
          angajații firmelor sale cliente pentru prelucrarea datelor lor medicale.
        </P>

        <H2>3. Ce date colectăm</H2>
        <P><strong>Date de cont:</strong><br />
          Nume, prenume, adresă de email, numele cabinetului, orașul — colectate la activarea contului.</P>
        <P><strong>Date profesionale:</strong><br />
          Titlu profesional, cod de parafă, semnătură digitală și ștampilă — opționale, furnizate de utilizator.</P>
        <P><strong>Date despre angajații firmelor cliente:</strong><br />
          Nume, prenume, CNP (stocat criptat AES-256-GCM), dată de naștere, gen, loc de muncă, rezultatele
          examinărilor medicale ocupaționale. Aceste date sunt introduse de medicii utilizatori ai platformei în
          exercitarea activității lor profesionale, în calitate de operator.</P>
        <P><strong>Date de utilizare:</strong><br />
          Adresă IP (hashată), timestamp-uri de autentificare, acțiuni efectuate în platformă — utilizate pentru
          securitate și audit.</P>
        <P><strong>Date din chatbot-ul de pe pagina de prezentare:</strong><br />
          Mesajele trimise asistentului AI de pe buzomed.com sunt salvate în formă anonimizată (fără nume, fără
          email) exclusiv pentru îmbunătățirea serviciului.</P>

        <H2>4. Cum utilizăm datele</H2>
        <P>Utilizăm datele pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Furnizarea și îmbunătățirea serviciilor platformei</Li>
          <Li>Trimiterea de emailuri tranzacționale (activare cont, notificări de scadențe, rapoarte)</Li>
          <Li>Asigurarea securității, integrității și auditului platformei</Li>
          <Li>Respectarea obligațiilor legale (arhivare documente medicale)</Li>
          <Li>Facturare și evidență contabilă</Li>
        </ul>
        <P>Nu vindem, nu închiriem și nu transferăm datele dumneavoastră către terți în scopuri comerciale.</P>

        <H2>5. Temeiul legal (GDPR Art. 6 și Art. 9)</H2>
        <P>Prelucrăm datele în baza următoarelor temeiuri legale:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>
            <strong>Executarea contractului</strong> (Art. 6(1)(b) GDPR) — pentru datele de cont și
            furnizarea serviciului contractat
          </Li>
          <Li>
            <strong>Obligație legală</strong> (Art. 6(1)(c) GDPR) — pentru datele necesare conformității
            cu legislația muncii și sănătății ocupaționale (HG 355/2007, Legea 319/2006, Legea 95/2006)
          </Li>
          <Li>
            <strong>Interese legitime</strong> (Art. 6(1)(f) GDPR) — pentru securitatea platformei,
            prevenirea fraudei și îmbunătățirea serviciului
          </Li>
          <Li>
            <strong>Obligație legală / interes public în domeniul sănătății</strong> (Art. 9(2)(b)(h) GDPR)
            — pentru datele speciale privind sănătatea angajaților, prelucrate în scopul medicinii preventive
            a muncii, cu respectarea secretului profesional medical (Legea 46/2003, Legea 95/2006)
          </Li>
        </ul>

        <H2>6. Sub-procesatori (furnizori terți)</H2>
        <P>
          În calitate de procesator, Verumsell SRL utilizează următorii sub-procesatori pentru furnizarea
          serviciului. Toți sub-procesatorii sunt selectați cu respectarea Art. 28(2) GDPR și sunt obligați
          contractual să asigure un nivel echivalent de protecție a datelor:
        </P>

        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, color: '#374151' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E2E8F0' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Sub-procesator</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Rol</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Locație date</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Mecanism transfer</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '10px 14px' }}><strong>Supabase Inc.</strong></td>
                <td style={{ padding: '10px 14px' }}>Infrastructură baze de date, autentificare</td>
                <td style={{ padding: '10px 14px' }}>Frankfurt, Germania (UE)</td>
                <td style={{ padding: '10px 14px' }}>UE/SEE — fără transfer extra-UE</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '10px 14px' }}><strong>Anthropic PBC</strong></td>
                <td style={{ padding: '10px 14px' }}>Procesare AI (date anonimizate)</td>
                <td style={{ padding: '10px 14px' }}>SUA</td>
                <td style={{ padding: '10px 14px' }}>Clauze Contractuale Standard (SCC) UE-SUA</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 14px' }}><strong>Brevo SAS (Sendinblue)</strong></td>
                <td style={{ padding: '10px 14px' }}>Trimitere emailuri tranzacționale</td>
                <td style={{ padding: '10px 14px' }}>Paris, Franța (UE)</td>
                <td style={{ padding: '10px 14px' }}>UE/SEE — fără transfer extra-UE</td>
              </tr>
            </tbody>
          </table>
        </div>
        <P>
          Cabinetul (Operatorul) este informat cu privire la sub-procesatorii utilizați. Orice modificare
          adusă listei de sub-procesatori va fi notificată cu cel puțin 14 zile înainte prin email.
        </P>

        <H2>7. Funcționalități AI și date personale</H2>
        <P>
          Platforma Buzomed utilizează servicii de inteligență artificială (Anthropic Claude API) pentru
          funcționalități specifice (asistent intern, sugestii cod CAEN, narativa rapoarte). Politica
          noastră strictă:
        </P>
        <P><strong>Ce NU trimitem niciodată la AI:</strong></P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Nume sau prenume ale angajaților</Li>
          <Li>CNP-uri sau orice identificator personal direct</Li>
          <Li>Date de contact individuale</Li>
          <Li>Orice date care ar permite reidentificarea unui individ</Li>
        </ul>
        <P><strong>Ce trimitem la AI (exclusiv date anonimizate/pseudonimizate):</strong></P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Cod CAEN al firmei (pentru sugestii de profil de risc)</Li>
          <Li>Valori medicale anonimizate (vârstă aproximativă, gen, valori numerice) fără identificatori</Li>
          <Li>Statistici agregate per firmă — pentru generarea narativei raportului anual</Li>
          <Li>Header-uri de coloane Excel — pentru maparea automată la import (nu datele efective)</Li>
        </ul>
        <P>
          Anthropic procesează aceste date în conformitate cu Clauze Contractuale Standard (SCC) aprobate
          de Comisia Europeană pentru transferuri UE-SUA (Decizia de punere în aplicare 2021/914) și nu
          utilizează datele transmise prin API pentru antrenarea modelelor.
        </P>

        <H2>8. CNP-uri — protecție specială</H2>
        <P>
          CNP-urile angajaților sunt criptate cu AES-256-GCM înainte de stocare. Cheia de criptare este
          separată de baza de date. CNP-ul în clar nu este niciodată stocat și nu este niciodată transmis
          către servicii externe, inclusiv AI.
        </P>

        <H2>9. Izolarea datelor între cabinete</H2>
        <P>
          Platforma utilizează Row Level Security (RLS) la nivel de bază de date. Datele unui cabinet sunt
          complet izolate de datele altor cabinete — este imposibil tehnic ca un utilizator al unui cabinet
          să acceseze datele altui cabinet.
        </P>

        <H2>10. Unde sunt stocate datele</H2>
        <P>
          Toate datele principale ale platformei sunt stocate pe servere situate în{' '}
          <strong>Frankfurt, Germania (UE)</strong>, prin intermediul Supabase Inc.
        </P>
        <P>
          Comunicațiile între client și server sunt protejate prin HTTPS/TLS 1.2+. Accesul intern la baza
          de date este restricționat prin politici de rețea și control al accesului bazat pe roluri.
        </P>

        <H2>11. Cât timp păstrăm datele</H2>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Date de cont activ: pe durata utilizării platformei + 30 de zile după reziliere</Li>
          <Li>
            Date despre examinări medicale ocupaționale: minim 7 ani conform HG 355/2007 și Legea 319/2006,
            termen ce poate fi extins prin lege specială pentru anumite expuneri profesionale
          </Li>
          <Li>Date de audit și loguri: 12 luni</Li>
          <Li>Date din chatbot (anonimizate): 24 luni</Li>
          <Li>Date de facturare: 5 ani conform Legii contabilității nr. 82/1991</Li>
        </ul>
        <P>
          La ștergerea contului, datele personale identificabile sunt șterse în termen de 30 de zile.
          Datele medicale pot fi reținute conform obligațiilor legale menționate mai sus.
        </P>

        <H2>12. Drepturile dumneavoastră (GDPR Art. 15-21)</H2>
        <P>Aveți dreptul la:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li><strong>Acces (Art. 15)</strong> — să solicitați o copie a datelor personale deținute despre dumneavoastră</Li>
          <Li><strong>Rectificare (Art. 16)</strong> — corectarea datelor inexacte sau incomplete</Li>
          <Li><strong>Ștergere (Art. 17)</strong> — &ldquo;dreptul de a fi uitat&rdquo;, în limitele obligațiilor legale de arhivare</Li>
          <Li><strong>Restricționare (Art. 18)</strong> — limitarea temporară a prelucrării</Li>
          <Li><strong>Portabilitate (Art. 20)</strong> — exportul datelor în format structurat, lizibil de mașină (JSON/CSV)</Li>
          <Li><strong>Opoziție (Art. 21)</strong> — față de prelucrarea bazată pe interese legitime</Li>
          <Li><strong>Retragerea consimțământului</strong> — acolo unde prelucrarea se bazează pe consimțământ</Li>
        </ul>
        <P>
          Cererile se depun la{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>{' '}
          și vor primi răspuns în termen de maximum 30 de zile calendaristice (termen ce poate fi extins
          cu 60 de zile pentru cereri complexe, cu notificarea dumneavoastră).
        </P>
        <P>
          Aveți de asemenea dreptul de a depune o plângere la{' '}
          <strong>Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
          (ANSPDCP)</strong>:{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" style={{ color: '#2BA39A' }}>
            www.dataprotection.ro
          </a>{' '}
          · B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București.
        </P>
        <P>
          <em>Notă pentru angajații firmelor cliente:</em> Drepturile dumneavoastră față de datele medicale
          introduse în platformă trebuie exercitate în principal față de Cabinetul medical (Operatorul),
          nu față de Verumsell SRL. Buzomed acționează ca procesator și va redirecționa orice cerere
          primită direct.
        </P>

        <H2>13. Incidente de securitate și notificări (Art. 33-34 GDPR)</H2>
        <P>
          În cazul unui incident de securitate care implică date cu caracter personal (acces neautorizat,
          divulgare, modificare sau distrugere accidentală):
        </P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>
            <strong>Notificarea ANSPDCP:</strong> Verumsell SRL va notifica ANSPDCP în termen de{' '}
            <strong>72 de ore</strong> de la constatarea incidentului, în conformitate cu Art. 33 GDPR,
            dacă incidentul prezintă risc pentru drepturile și libertățile persoanelor fizice
          </Li>
          <Li>
            <strong>Notificarea persoanelor afectate:</strong> Dacă incidentul prezintă un risc ridicat
            pentru drepturile și libertățile persoanelor fizice, acestea vor fi notificate fără întârziere
            nejustificată, conform Art. 34 GDPR
          </Li>
          <Li>
            <strong>Notificarea Clientului (Cabinetului):</strong> În calitate de procesator, vom notifica
            Cabinetul (Operatorul) fără întârziere nejustificată după constatarea oricărui incident care
            afectează datele procesate în numele său, pentru a-i permite să își îndeplinească propriile
            obligații de notificare
          </Li>
        </ul>
        <P>
          Menținem un registru intern al incidentelor de securitate conform Art. 33(5) GDPR. Procedurile
          de răspuns la incidente sunt revizuite anual.
        </P>

        <H2>14. Responsabil cu Protecția Datelor (DPO)</H2>
        <P>
          Verumsell SRL nu are obligația legală de a desemna un Responsabil cu Protecția Datelor (DPO/RPD)
          conform Art. 37 GDPR, întrucât prelucrarea datelor speciale (medicale) este accidentală față de
          activitatea principală a societății și nu se realizează la scară largă.
        </P>
        <P>
          Toate solicitările legate de protecția datelor sunt gestionate de echipa Buzomed la:{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>
        </P>

        <H2>15. Cookie-uri</H2>
        <P>
          Buzomed utilizează exclusiv cookie-uri funcționale necesare autentificării și funcționării
          platformei (sesiune, preferințe limbă). Nu utilizăm cookie-uri de tracking, publicitate sau
          analiză de comportament.
        </P>
        <P>
          Nu este necesară acceptarea cookie-urilor de marketing pentru utilizarea platformei.
        </P>

        <H2>16. Legislație aplicabilă</H2>
        <P>
          Prezenta politică este redactată în conformitate cu:
        </P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Regulamentul (UE) 2016/679 (GDPR)</Li>
          <Li>Legea nr. 190/2018 privind măsurile de punere în aplicare a GDPR în România</Li>
          <Li>Legea nr. 82/2012 privind reținerea datelor (cu modificările ulterioare)</Li>
          <Li>HG nr. 355/2007 privind supravegherea sănătății lucrătorilor (cu modificările ulterioare)</Li>
          <Li>Legea nr. 319/2006 — Legea securității și sănătății în muncă</Li>
          <Li>Legea nr. 95/2006 — Legea privind reforma în domeniul sănătății</Li>
          <Li>Legea nr. 46/2003 — Drepturile pacientului (confidențialitate medicală)</Li>
          <Li>Legea nr. 677/2001 (abrogată, înlocuită de GDPR + Legea 190/2018) — menționată pentru referință istorică</Li>
        </ul>

        <H2>17. Modificări ale politicii</H2>
        <P>
          Orice modificare semnificativă a acestei politici va fi comunicată prin email utilizatorilor
          activi cu cel puțin <strong>14 zile</strong> înainte de intrarea în vigoare, cu indicarea clară
          a secțiunilor modificate. Utilizarea continuă a platformei după data intrării în vigoare
          constituie acceptarea politicii actualizate.
        </P>
        <P>
          Versiunile anterioare ale politicii pot fi solicitate la{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>.
        </P>

        <H2>18. Contact</H2>
        <P>
          Pentru orice întrebare legată de confidențialitate sau pentru exercitarea drepturilor GDPR:<br />
          <strong>Email:</strong>{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a><br />
          <strong>Răspuns:</strong> în termen de maximum 72 de ore lucrătoare la întrebări generale;
          maximum 30 de zile calendaristice pentru cereri formale de exercitare a drepturilor
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

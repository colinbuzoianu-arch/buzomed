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
          Acesta reprezintă contractul propus de Prestator. Orice comandă confirmată de Client/Utilizator prin
          bifarea căsuței &ldquo;Sunt de acord cu termenii și condițiile&rdquo; reprezintă o acceptare a ofertei
          Prestatorului în condițiile stipulate de Art. 9 din Legea comerțului electronic nr. 365/2002. Bifarea
          căsuței constituie o semnătură electronică în sensul Art. 4 pct. 3 din Legea semnăturii electronice
          nr. 455/2001, având aceeași valoare cu o semnătură olografă.
        </P>

        <H2>1. Părțile contractante</H2>
        <P>
          <strong>1.1. Prestatorul:</strong> Verumsell SRL, cu sediul social în România, înregistrată la Oficiul
          Registrului Comerțului, reprezentată legal prin administrator, în calitate de <strong>PRESTATOR</strong>.
          Date complete disponibile la cerere:{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>.
        </P>
        <P>
          <strong>1.2. Clientul:</strong> Persoana juridică sau persoana fizică autorizată identificată prin datele
          introduse în formularul de înregistrare sau de comandă. Factura emisă devine parte integrantă a
          prezentului contract.
        </P>

        <H2>2. Definiția termenilor</H2>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>
            <strong>&ldquo;Serviciu&rdquo;</strong>: serviciile puse la dispoziție de Prestator prin intermediul
            platformei Buzomed, sub forma unui abonament.
          </Li>
          <Li>
            <strong>&ldquo;Client&rdquo;</strong>: persoana juridică sau fizică autorizată care se înregistrează
            ca utilizator și beneficiază de serviciile platformei.
          </Li>
          <Li>
            <strong>&ldquo;Cont de utilizator&rdquo;</strong>: contul de înregistrare creat de utilizator în cadrul
            platformei Buzomed.
          </Li>
          <Li>
            <strong>&ldquo;Date cu caracter personal&rdquo;</strong>: informații referitoare la o persoană fizică
            identificată sau identificabilă, conform Regulamentului (UE) 2016/679 (GDPR).
          </Li>
          <Li>
            <strong>&ldquo;Cabinet&rdquo;</strong>: entitatea juridică (cabinet medical, clinică, societate
            comercială cu activitate de medicină a muncii) care creează și administrează un cont în platformă.
          </Li>
          <Li>
            <strong>&ldquo;Prestator&rdquo;</strong>: Verumsell SRL, proprietarul și administratorul platformei
            Buzomed.
          </Li>
          <Li>
            <strong>&ldquo;Platforma Buzomed&rdquo;</strong>: aplicația web disponibilă la buzomed.com și
            subdomeniile sale, inclusiv toate funcționalitățile accesibile după autentificare.
          </Li>
          <Li>
            <strong>&ldquo;Date medicale&rdquo;</strong>: date privind starea de sănătate a angajaților,
            introduse în platformă de medicul utilizator în exercitarea activității sale profesionale, considerate
            date speciale conform Art. 9 GDPR.
          </Li>
        </ul>

        <H2>3. Obiectul contractului</H2>
        <P>
          Prezentul contract este aplicabil tuturor conturilor create și comenzilor efectuate prin intermediul
          platformei. Clientul se obligă să ia cunoștință de aceste condiții înainte de a-și deschide un cont.
          Acceptarea prezentului contract se realizează prin bifarea căsuței &ldquo;Sunt de acord cu termenii și
          condițiile&rdquo; la înregistrare.
        </P>
        <P>
          Buzomed este o platformă SaaS de gestiune pentru cabinete de medicină a muncii. Serviciile pot fi
          accesate printr-un browser web de pe sisteme de operare Windows, macOS și Linux, precum și prin
          aplicații mobile pentru iOS și Android.
        </P>

        <H2>4. Durata contractului</H2>
        <P>
          Prezentul contract se încheie pe perioadă nedeterminată începând de la data creării contului, iar
          obligațiile părților intră în vigoare de la această dată.
        </P>
        <P>
          Prestatorul oferă o perioadă de testare gratuită de <strong>30 de zile</strong> de la crearea contului.
          După expirarea perioadei de testare, Clientul poate opta pentru un abonament plătit. În cazul în care
          nu optează pentru un abonament, accesul va fi întrerupt.
        </P>
        <P>
          În cazul în care Clientul nu notifică renunțarea la abonament cu minimum <strong>30 de zile
          calendaristice</strong> înainte de expirarea perioadei curente, abonamentul se prelungește automat
          fără nicio altă formalitate.
        </P>
        <P>
          Contul utilizatorului va fi șters automat după <strong>2 ani</strong> de la expirarea abonamentului
          sau, în cazul perioadei de testare neconvertite, după 2 ani de la expirarea perioadei de testare.
          Clientul va fi notificat în prealabil.
        </P>

        <H2>5. Eligibilitate</H2>
        <P>Platforma este destinată exclusiv:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Medicilor de medicina muncii autorizați conform legislației române</Li>
          <Li>Personalului administrativ al cabinetelor de medicina muncii</Li>
          <Li>Administratorilor de clinici cu profil de medicina muncii</Li>
        </ul>
        <P>
          Accesul persoanelor care nu se încadrează în categoriile de mai sus poate fi restricționat la
          discreția Prestatorului.
        </P>

        <H2>6. Contul dumneavoastră</H2>
        <P>Sunteți responsabil pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Păstrarea confidențialității credențialelor de acces</Li>
          <Li>Toate acțiunile efectuate din contul dumneavoastră</Li>
          <Li>Acuratețea datelor introduse în platformă</Li>
          <Li>Actualizarea datelor din cont imediat ce intervin schimbări</Li>
        </ul>
        <P>
          Buzomed nu poate fi tras la răspundere pentru prejudicii cauzate de compromiterea contului din culpa
          utilizatorului sau ca urmare a imposibilității de a accesa adresa de email declarată în cont.
        </P>

        <H2>7. Declarațiile clientului</H2>
        <P>Prin utilizarea platformei, declarați și garantați că:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Toate informațiile furnizate la înregistrare sunt corecte, precise și nu induc în eroare</Li>
          <Li>
            Sunteți reprezentantul legal al cabinetului/clinicii înregistrate sau dețineți o împuternicire
            expresă din partea reprezentantului legal pentru a efectua înregistrarea
          </Li>
          <Li>
            Utilizarea platformei se face exclusiv în calitate profesională (B2B), în deplină legalitate, cu
            respectarea tuturor normelor aplicabile activității de medicină a muncii
          </Li>
          <Li>
            Dețineți temeiul legal pentru prelucrarea datelor cu caracter personal ale angajaților firmelor
            pentru care efectuați servicii de medicină a muncii
          </Li>
        </ul>
        <P>
          Prezentul contract se încheie între profesioniști (B2B). Prevederile O.G. 21/1992 privind protecția
          consumatorilor și ale altor acte normative conexe destinate consumatorilor persoane fizice nu sunt
          aplicabile.
        </P>

        <H2>8. Responsabilități medicale</H2>
        <P>
          <strong>Important:</strong> Buzomed este un instrument de gestiune administrativă. Platforma nu oferă și
          nu înlocuiește consultul medical sau decizia clinică.
        </P>
        <P>Responsabilitatea pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Verdictul de aptitudine (apt / apt condiționat / inapt temporar / inapt)</Li>
          <Li>Conținutul fișelor de aptitudine semnate</Li>
          <Li>Recomandările și concluziile medicale</Li>
        </ul>
        <P>
          aparține exclusiv medicului utilizator, în conformitate cu legislația română aplicabilă (Legea 95/2006
          privind reforma în sănătate, HG 355/2007 privind supravegherea sănătății lucrătorilor, Legea 319/2006
          privind securitatea și sănătatea în muncă, Legea 46/2003 privind drepturile pacientului).
        </P>
        <P>
          Funcționalitățile de inteligență artificială ale platformei (pre-completare formular, rezumat clinic,
          raport anual narativ) oferă exclusiv <strong>sugestii orientative</strong>. Decizia finală aparține
          întotdeauna medicului. Medicul are obligația de a verifica și corecta orice sugestie înainte de semnare.
        </P>

        <H2>9. Obligațiile clientului</H2>
        <P>Clientul se obligă să:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>
            Utilizeze serviciile oferite de Prestator în deplină legalitate, cunoscând dispozițiile legale în
            vigoare cu privire la activitatea de medicină a muncii
          </Li>
          <Li>
            Respecte în totalitate prevederile legale privind drepturile de autor și protecția datelor cu
            caracter personal în ceea ce privește datele introduse în platformă
          </Li>
          <Li>
            Proceseze datele cu caracter personal ale angajaților conform GDPR (Regulamentul (UE) 2016/679),
            Legii 190/2018 privind implementarea GDPR în România și legislației aplicabile medicinii muncii
          </Li>
          <Li>
            Notifice angajații cu privire la prelucrarea datelor lor medicale, în calitate de operator de date
          </Li>
          <Li>
            Să nu redistribuie, să nu vândă și să nu acorde acces terților neautorizați la platformă
          </Li>
          <Li>
            Să nu utilizeze platforma pentru introducerea de date false, fabricate sau care pot induce în eroare
          </Li>
        </ul>
        <P>
          Clientul este unic responsabil pentru întregul conținut existent în contul său și pentru legalitatea
          documentelor emise din platformă.
        </P>

        <H2>10. Obligațiile prestatorului</H2>
        <P>Prestatorul asigură:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Accesul la funcționalitățile platformei conform abonamentului activ</Li>
          <Li>Backup periodic al datelor stocate în platformă</Li>
          <Li>Conexiune securizată prin protocol HTTPS (TLS)</Li>
          <Li>Izolarea datelor fiecărui cabinet față de alte cabinete (Row Level Security)</Li>
          <Li>
            Asistență tehnică prin email la{' '}
            <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>{' '}
            de luni până vineri, în zilele lucrătoare
          </Li>
          <Li>Notificarea prealabilă în cazul modificărilor semnificative ale serviciului</Li>
          <Li>Notificarea utilizatorilor cu privire la eventualele breșe de securitate care afectează datele lor</Li>
        </ul>
        <P>
          Prestatorul nu oferă asistență medicală, contabilă sau financiară. Nu monitorizează și nu exercită
          niciun control editorial asupra datelor și documentelor introduse de Client.
        </P>
        <P>
          Prestatorul acordă Clientului un drept de utilizare <strong>neexclusiv, netransferabil și limitat</strong>{' '}
          pe durata abonamentului activ, pentru accesarea serviciilor platformei.
        </P>

        <H2>11. Prețuri și facturare</H2>
        <P>
          Prețurile valabile sunt cele comunicate la înregistrare sau actualizate pe platformă. Facturarea se
          realizează în conformitate cu pachetul de abonament ales.
        </P>
        <P>
          Serviciile medicale furnizate prin intermediul platformei pot fi scutite de TVA în conformitate cu
          Art. 292 din Codul Fiscal român (servicii medicale). Clientul este responsabil pentru verificarea
          propriilor obligații fiscale.
        </P>
        <P>
          Prețurile pot fi modificate cu notificare prealabilă de minimum <strong>30 de zile</strong>. Continuarea
          utilizării platformei după intrarea în vigoare a noilor prețuri constituie acceptarea acestora.
        </P>

        <H2>12. Date și confidențialitate</H2>
        <P>
          Utilizarea platformei implică prelucrarea de date cu caracter personal și date medicale (date speciale
          conform Art. 9 GDPR). Verumsell SRL acționează în calitate de <strong>procesator de date</strong> în
          relația cu cabinetul dumneavoastră (în calitate de operator), conform Art. 28 din Regulamentul (UE)
          2016/679.
        </P>
        <P>
          Detalii complete privind prelucrarea datelor, temeiul legal, drepturile dumneavoastră și măsurile de
          securitate sunt disponibile în{' '}
          <Link href="/privacy" style={{ color: '#2BA39A' }}>Politica de Confidențialitate</Link>.
        </P>

        <H2>13. Utilizare acceptabilă</H2>
        <P>Este interzisă utilizarea platformei pentru:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Introducerea de date false, fabricate sau care nu corespund realității clinice</Li>
          <Li>Accesarea sau tentativa de accesare a datelor altor cabinete</Li>
          <Li>Orice activitate ilegală sau contrară eticii medicale</Li>
          <Li>Revânzarea, redistribuirea sau sublicențierea accesului la platformă</Li>
          <Li>Tentative de decompilare, reverse engineering sau dezasamblare a platformei</Li>
          <Li>Orice acțiune care ar putea compromite securitatea sau integritatea platformei</Li>
        </ul>

        <H2>14. Disponibilitate și modificări ale serviciului</H2>
        <P>
          Ne străduim să menținem platforma disponibilă 24/7. Nu garantăm disponibilitatea neîntreruptă și nu
          răspundem pentru prejudicii cauzate de întreruperi tehnice planificate sau neplanificate.
        </P>
        <P>
          Prestatorul își rezervă dreptul de a modifica sau suspenda temporar servicii sau funcționalități ale
          platformei, notificând Clienții cu minimum <strong>14 zile</strong> calendaristice înainte pentru
          modificările semnificative. Pentru situații de risc iminent tehnic sau de securitate, suspendarea
          poate interveni fără notificare prealabilă.
        </P>
        <P>
          Prestatorul își rezervă dreptul de a modifica acești Termeni și Condiții, notificând Clienții prin
          email sau prin platformă. Versiunea aplicabilă va fi cea publicată pe site. Continuarea utilizării
          platformei după intrarea în vigoare a modificărilor constituie acceptarea lor.
        </P>

        <H2>15. Proprietate intelectuală</H2>
        <P>
          Verumsell SRL deține toate drepturile de proprietate intelectuală cu privire la platforma Buzomed,
          inclusiv codul sursă, bazele de date, design-ul, logo-ul, structura, conținutul editorial și orice
          alte elemente ale platformei, în conformitate cu legislația română și europeană în vigoare privind
          drepturile de autor și proprietatea intelectuală.
        </P>
        <P>Nu aveți dreptul să:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Copiați, reproduceți sau distribuiți orice parte a platformei fără acordul scris prealabil</Li>
          <Li>Decompilați, aplicați reverse engineering sau dezasamblați platforma</Li>
          <Li>Utilizați marca &ldquo;Buzomed&rdquo; sau &ldquo;Verumsell&rdquo; fără acord scris</Li>
          <Li>Redistribuiți, vindeți sau sublicențiați accesul la platformă</Li>
          <Li>Modificați sau creați opere derivate bazate pe platformă</Li>
        </ul>
        <P>
          Conținutul introdus de Client în platformă (date despre angajați, examinări, documente) rămâne
          proprietatea Clientului. Prestatorul nu revendică niciun drept de proprietate asupra acestuia.
        </P>

        <H2>16. Garanții</H2>
        <P>
          Clientul confirmă că datele și informațiile introduse în platformă sunt reale și că este reprezentant
          legal sau împuternicit al entității pentru care creează contul. Clientul își asumă întreaga răspundere
          privind datele furnizate și acceptă că Prestatorul nu va fi ținut răspunzător față de Client și/sau
          față de terți pentru prejudiciile de orice natură rezultate ca urmare a furnizării unor informații
          eronate sau a utilizării necorespunzătoare a platformei.
        </P>
        <P>
          Platforma este furnizată &ldquo;ca atare&rdquo; (&ldquo;as is&rdquo;), fără garanții exprese sau
          implicite cu privire la absența erorilor sau la adecvarea pentru un scop particular, în limitele
          permise de legea română.
        </P>

        <H2>17. Limitarea răspunderii</H2>
        <P>
          Clientul utilizează platforma pe riscul propriu. În niciun caz Prestatorul, directorii, angajații sau
          agenții săi nu vor fi ținuți responsabili pentru prejudicii indirecte, viitoare sau speciale, pierderi
          de profit sau date, rezultate din utilizarea sau imposibilitatea de utilizare a platformei, chiar dacă
          Prestatorul a fost înștiințat despre posibilitatea producerii unor astfel de prejudicii.
        </P>
        <P>
          În măsura permisă de legea română, răspunderea totală a Verumsell SRL față de Client este limitată la
          sumele efectiv plătite de Client pentru serviciu în ultimele <strong>12 luni</strong> anterioare
          producerii prejudiciului.
        </P>

        <H2>18. Încetarea contractului</H2>
        <P>Prezentul contract încetează în următoarele cazuri:</P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Prin acordul scris al ambelor părți</Li>
          <Li>
            Prin decizia unilaterală a oricărei părți, transmisă în scris celeilalte părți cu minimum{' '}
            <strong>30 de zile calendaristice</strong> înainte de data dorită de încetare
          </Li>
          <Li>
            De drept, în caz de neîndeplinire sau îndeplinire defectuoasă repetată a obligațiilor contractuale
            de către oricare dintre părți
          </Li>
          <Li>
            În caz de dizolvare, lichidare, faliment sau retragerea autorizației de funcționare a uneia
            dintre părți
          </Li>
          <Li>
            La inițiativa Prestatorului, fără notificare prealabilă, în caz de utilizare abuzivă sau ilegală
            a platformei de către Client
          </Li>
        </ul>
        <P>
          La încetarea contractului, Clientul are dreptul să exporte datele sale din platformă în termen de
          30 de zile. Datele medicale vor fi tratate conform Politicii de Confidențialitate și obligațiilor
          legale aplicabile.
        </P>

        <H2>19. Soluționarea litigiilor</H2>
        <P>
          Părțile vor căuta în primul rând soluționarea amiabilă a oricărui litigiu prin discuții directe,
          în termen de <strong>30 de zile lucrătoare</strong> de la înregistrarea reclamației la adresa{' '}
          <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A' }}>hello@buzomed.com</a>.
        </P>
        <P>
          În cazul în care soluționarea amiabilă nu este posibilă, litigiile vor fi supuse spre soluționare
          instanțelor judecătorești române competente, în conformitate cu legislația română în vigoare.
        </P>

        <H2>20. Legea aplicabilă</H2>
        <P>
          Acești Termeni și Condiții sunt guvernați de legea română, inclusiv, dar fără a se limita la:
        </P>
        <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
          <Li>Codul Civil român</Li>
          <Li>Legea comerțului electronic nr. 365/2002</Li>
          <Li>Legea semnăturii electronice nr. 455/2001</Li>
          <Li>Regulamentul (UE) 2016/679 (GDPR)</Li>
          <Li>Legea nr. 190/2018 privind implementarea GDPR în România</Li>
          <Li>HG 355/2007 privind supravegherea sănătății lucrătorilor</Li>
          <Li>Legea 319/2006 privind securitatea și sănătatea în muncă</Li>
        </ul>

        <H2>21. Contact</H2>
        <P>
          Pentru orice întrebare legată de acești termeni:{' '}
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

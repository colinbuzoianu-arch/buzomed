# Brief: Auto-creare Companii și Locuri de Muncă din Import Excel
> Pentru Claude Code. Citește CLAUDE.md și AGENTS.md înainte de orice modificare.

---

## Context

Importul bulk de angajați există deja în Buzomed (template_angajati.csv cu 5 coloane).
Problema: medicii cu sute de angajați de la zeci de firme trebuie să creeze manual
fiecare companie și loc de muncă înainte de import — imposibil de scalat.

Acest brief extinde importul existent să creeze automat companiile și locurile de muncă
din datele din Excel, fără a modifica fluxul de import pentru medicii care nu furnizează
aceste date.

---

## 1. Noul template Excel

Înlocuiește `template_angajati.csv` cu versiunea extinsă:

```
prenume,nume,id_angajat,email,departament,functie,nume_companie,cui_companie,adresa_companie,loc_de_munca
Ion,Popescu,001,ion@firma.ro,IT,Programator,SC Firma SRL,RO12345678,Str. Exemplu 1 Cluj,Birou IT
Maria,Ionescu,002,maria@firma.ro,,,SC Firma SRL,RO12345678,,
Ana,Constantin,003,,,,,,,
```

### Reguli template:
- Primele 5 coloane (`prenume`, `nume`, `id_angajat`, `email`, `departament`) — neschimbate, comportament identic cu actualul
- `functie` — opțional, deja suportat de importer dar nu în template; acum adăugat explicit
- `nume_companie` + `cui_companie` — împreună identifică unic o companie; dacă sunt prezente, compania se creează automat dacă nu există
- `adresa_companie` — opțional, se folosește doar la crearea companiei noi; ignorat dacă compania există deja
- `loc_de_munca` — opțional; dacă e prezent, locul de muncă se creează automat sub compania respectivă dacă nu există

### Backward compatibility:
Dacă coloanele noi lipsesc complet din Excel, importul funcționează exact ca înainte.
Nu se sparge nimic pentru medicii care folosesc template-ul vechi.

---

## 2. Logica de procesare la import

Procesează fiecare rând în această ordine:

### Pasul 1 — Rezolvă compania
```typescript
if (row.cui_companie && row.nume_companie) {
  // Caută compania în tenantul curent după CUI
  let company = await findCompanyByCUI(tenantId, row.cui_companie)
  
  if (!company) {
    // Creează compania automat
    company = await createCompany({
      tenantId,
      name: row.nume_companie,
      cui: row.cui_companie,
      address: row.adresa_companie || null,
      // restul câmpurilor rămân null — medicul le completează manual ulterior
    })
    companiesCreated++ // pentru raportul de import
  }
  
  resolvedCompanyId = company.id
} else {
  resolvedCompanyId = null // angajatul se importă fără companie
}
```

### Pasul 2 — Rezolvă locul de muncă
```typescript
if (row.loc_de_munca && resolvedCompanyId) {
  // Caută locul de muncă după nume în compania respectivă
  let workplace = await findWorkplaceByName(resolvedCompanyId, row.loc_de_munca)
  
  if (!workplace) {
    // Creează locul de muncă automat
    workplace = await createWorkplace({
      companyId: resolvedCompanyId,
      tenantId,
      name: row.loc_de_munca,
      // hazardele NU se setează automat — medicul le adaugă manual din UI
    })
    workplacesCreated++ // pentru raportul de import
  }
  
  resolvedWorkplaceId = workplace.id
} else {
  resolvedWorkplaceId = null
}
```

### Pasul 3 — Creează/actualizează angajatul
Comportament identic cu actualul, plus:
- Asignează `companyId = resolvedCompanyId` dacă există
- Asignează `workplaceId = resolvedWorkplaceId` dacă există

### Deduplicare în același import
Dacă 200 de rânduri au același `cui_companie`, compania se creează o singură dată
la primul rând și se reutilizează pentru restul. Folosește un Map în memorie pe durata
procesării unui import:
```typescript
const companiesCache = new Map<string, string>() // cui → companyId
const workplacesCache = new Map<string, string>() // `${companyId}:${name}` → workplaceId
```

---

## 3. Raportul de import — extinde UI-ul existent

Raportul de import afișat după procesare trebuie să includă secțiuni noi:

```
✓ 247 angajați importați cu succes
✓ 12 angajați actualizați

✓ 8 companii create automat    ← NOU
✓ 15 locuri de muncă create automat    ← NOU

⚠ 3 angajați importați fără companie (coloane lipsă)    ← NOU
⚠ 5 angajați importați fără loc de muncă    ← NOU

✗ 2 rânduri cu erori (vezi detalii)
```

**Avertisment important** afișat în raport dacă s-au creat locuri de muncă automat:
> „Locurile de muncă create automat nu au hazarde asociate. 
>  Accesează Companies → [Companie] → Locuri de muncă pentru a adăuga profilul de risc."

Link direct către fiecare companie nou creată.

---

## 4. Validări și erori

### Validări la procesare:
- `cui_companie` fără `nume_companie` (sau invers) → warning pe rând, angajatul se importă fără companie
- `loc_de_munca` fără `cui_companie` → warning pe rând, locul de muncă ignorat (nu știm la ce companie să îl asignăm)
- CUI invalid (nu e numeric sau lungime greșită) → warning, compania nu se creează

### Nu sunt erori fatale — importul continuă
Nicio validare nu oprește complet importul. Fiecare problemă e un warning pe rândul respectiv,
restul rândurilor se procesează normal.

---

## 5. Actualizare UI — pagina de import

### Template download:
Butonul „Descarcă template" generează noul CSV cu toate 10 coloanele.
Adaugă un rând de exemplu în template (comentat sau ca date demo) ca să
medicul înțeleagă formatul.

### Tooltip / hint lângă butonul de upload:
> „Coloanele nume_companie, cui_companie și loc_de_munca sunt opționale. 
>  Dacă sunt prezente, companiile și locurile de muncă se creează automat."

### Pagina Companies după import:
Companiile create automat apar imediat în lista de companii a tenantului,
cu un badge „Creat din import" (sau similar) care dispare după ce medicul
editează manual compania. Badge-ul e util ca reminder că datele pot fi incomplete.

---

## 6. Ce NU face acest import automat

Pentru a evita complexitate și date greșite, următoarele NU se fac automat:

- **Hazarde CAEN** pe locurile de muncă create — medicul le adaugă manual
- **Date complete companie** (telefon, email contact, persoană de contact) — doar nume + CUI + adresă din Excel
- **Actualizarea companiilor existente** — dacă CUI-ul există deja, datele companiei NU se suprascriu din Excel
- **Ștergerea companiilor** dacă lipsesc din import

---

## 7. Ordinea de implementare

1. Extinde funcția de procesare import cu logica de companie + workplace (backend)
2. Actualizează template CSV
3. Extinde raportul de import cu noile secțiuni
4. Adaugă badge „Creat din import" pe companiile nou create
5. Actualizează tooltip/hint în UI-ul de upload
6. Testează cu un Excel de 3 scenarii:
   - Angajați cu companie + loc de muncă complete
   - Angajați cu companie dar fără loc de muncă
   - Angajați fără nicio informație de companie (backward compat)

---

## Criterii de acceptare

- [ ] Template nou cu 10 coloane se descarcă corect
- [ ] Import cu coloane noi creează companiile automat, o singură dată per CUI
- [ ] Import cu coloane noi creează locurile de muncă automat, o singură dată per nume+companie
- [ ] Companiile create apar imediat în tab-ul Companies
- [ ] Import fără coloanele noi funcționează identic cu înainte (backward compat)
- [ ] Raportul de import afișează câte companii și locuri de muncă s-au creat
- [ ] Avertisment afișat pentru locuri de muncă fără hazarde
- [ ] Badge „Creat din import" vizibil pe companiile nou create

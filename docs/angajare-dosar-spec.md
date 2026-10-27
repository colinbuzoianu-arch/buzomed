# Spec — Examen la angajare: fill "Examen medical la angajare" + "Dosar medical" from the examination

Context: `control_periodic` is done (docs/periodic-sheet-spec.md, docs/periodic-sheet-ux-spec.md, the pre-sign
checklist). Now do the same for exam type **`angajare`**, which prints two sheets:

1. **Examen medical la angajare** (`Examen-medical-angajare-BLANK.pdf`) — same 119 positions as the periodic
   sheet, keys **without** the `p_` prefix. The periodic work was designed for this: reuse
   `lib/examinations/clinical-exam.ts` as-is.
2. **Dosar medical** (`Dosar-Medical-BLANK.pdf`, 62 positions) — identity, ruta profesională, declarații,
   antecedente, condiții de viață. Today only 8 positions are filled, although Buzomed already collects most of
   the rest in the Anamneză step (`intake_*` keys) — they are just never printed.

Do not change `control_periodic` behaviour or output. Work in phases; after each: `npx tsc --noEmit` + Biome,
`git diff --stat`, short summary, then STOP for my OK. No production deploy without my approval.

---

## Phase 0 — Fix the Dosar medical template (it is broken by itself)

Facts (verified on the blank PDF, before any filling):
- The light-blue input boxes are **drawn into the page content** of `Dosar-Medical-BLANK.pdf` (there are no
  AcroForm fields or annotations). They sit **~6pt higher than their labels**, so each row's boxes overlap the
  labels of the row above ("Prenume:", "Data nașterii:", "Sex:", "Adresa:", "Telefon:", "Activități îndeplinite…"
  are partly covered). Example: label „Unitate:" bottom at y≈737, its box spans y 742.9–753.9.
- „Adresa / Telefon" and „Ocupația/funcția / Formare profesională" rows are only 9pt apart — cramped.
- The „RUTA PROFESIONALĂ" table has headers but **no row positions** in field_coordinates.json.
- The page is half empty below „Stagiul militar".

Tasks:
1. Find out how the BLANK templates were generated (look for a generator script in the repo / git history).
   If one exists, fix it there; if not, write `scripts/templates/build-dosar-medical.ts` (pdf-lib) that
   regenerates the page with the same text content and order, and keep that script in the repo.
2. Layout rules: every input box sits on the **same baseline as its label**, starts ≥ 4pt right of the label's
   last glyph, never overlaps any text; ≥ 14pt between rows. Keep the light boxes (the doctor is used to them) or
   use thin underlines — your call, but consistent.
3. Add a **Ruta profesională table with 4 rows** × 5 columns (firma, post de muncă, perioadă, funcția, noxa) using
   the existing header positions.
4. Regenerate the `Dosar-Medical-BLANK.pdf` entries in `lib/examinations/field_coordinates.json` from the
   generator (never by hand). Keep every existing key name; add `ruta_<row>_<col>` keys (row 1–4, col
   firma|post|perioada|functia|noxa).
5. **"Robotoy" bug:** on the doctor's dosar a stray copy of the company name prints under the „Nume" row. In
   the code I reviewed only `unitate` gets the company name, so find what draws it in the current code
   (search every write of `workplace.company.name` for docKey `dosar_medical`, and check for `\n` / wrapping in
   `pdf-fill.ts` — pdf-lib `drawText` with `maxWidth` wraps onto lines BELOW the field). Explain the cause
   before fixing.
6. Render the blank template and a filled test dosar to PNG and show me both.

Do not touch any other template.

---

## Phase 1 — Examen medical la angajare = periodic, without the prefix

1. `lib/examinations/document-templates.ts`: set `showClinicalSystemsExam: true` and `showSupplementaryExams: true`
   for `angajare` (it already has `showInitialIntake`, `showHearing`, `showLung`).
2. Documents route, `examen_angajare` branch: build fields with `buildPeriodicExamFields` **without** the `p_`
   prefix (rename the function to something neutral like `buildClinicalSheetFields` if you want; keep the
   periodic output byte-identical). Same changes as periodic: `concl_text` ← clinical conclusion text,
   `spec_text` ← `clinicalFindings`, `vap_corectie`, obesity, supplementary exams, glycemia.
3. Everything from the periodic UX spec applies to angajare too, generalised by exam type rather than
   hard-coded to periodic: Pe-foaie markers (`periodic-sheet-map.ts` → a map keyed by sheet), legend, step
   header lines, character counters, hints, „Vezi foaia" (for angajare open `examen_angajare`), and the pre-sign
   checklist. For angajare the marker text names the sheet: „Examen angajare §5" vs „Dosar medical".
4. Verify: a periodic exam's PDF is byte-identical before/after (compare buffers in a quick script).

---

## Phase 2 — Dosar medical: print what we already collect, add what is missing

New definition file `lib/examinations/dosar-medical.ts` (same pattern as clinical-exam.ts: one declarative list →
UI, validation, PDF mapping, sheet markers). Storage: existing `anamnesis` bucket (reuse the existing `intake_*`
keys — do NOT rename them, old exams must keep their data) + employee record.

| PDF key(s) | Source | Status |
|---|---|---|
| `unitate`, `punct_lucru`, `adresa_unitate` | company / workplace | exists |
| `sectia` | `workplace.department` | map it |
| `nume`, `prenume`, `data_nasterii`, `sex` | employee | exists |
| `varsta` | computed from birthDate at examinedAt | map it |
| `cnp` | `resolveEmployeeCnp` (as the other documents do, incl. its audit log) | map it |
| `adresa_pacient`, `telefon` | employee address / phone | map it |
| `ocupatia` | employee.jobTitle | exists |
| `formare` | new `anamnesis.intake_formare_profesionala` (text) | new input |
| `ruta_*` (4 rows) | `anamnesis.intake_ruta_profesionala` becomes a list of up to 4 rows {firma, post, perioada, functia, noxa}. Migration-free: if the stored value is the old free-text string, show it in a read-only "text vechi" line and print it in row 1 `firma` column truncated | new UI |
| `activitati_loc_munca` | new `anamnesis.intake_activitati_loc_munca` (text) | new input |
| `medic_familie` | `anamnesis.intake_medic_familie`; if empty, fall back to employee.medicCurantName | map it |
| `handicap_nu/da` | employee.disabilityDegree (null → nu) | map it |
| `invalid_nu/da`, `grad_inv` | new `anamnesis.intake_invaliditate` (nu/da) + `intake_grad_invaliditate` (I/II/III) | new input |
| `itm_nu/da` | new `anamnesis.intake_evidenta_itm` (nu/da) | new input |
| `semnatura_pacient` | **never filled** — the worker signs by hand | — |
| `antec_heredo`, `heredo_fara_imp` | existing `anamnesis.familyHistory`; new checkbox `intake_heredo_fara_importanta` | map + new |
| `ap_um`, `ap_n`, `ap_a`, `ap_s` | new `anamnesis.intake_ap_um/n/a/s` (short text), **shown only when employee.gender = 'F'** | new input — TODO(doctor): confirm meaning/labels |
| `neaga_patologice`, `ap_recomandari` | new checkbox `intake_neaga_patologice`; `ap_recomandari` ← existing `anamnesis.chronicConditions` + `medications`? → TODO(doctor): ask what she writes there; until then map nothing | new / ask |
| `fumat_*`, `tigari_zi`, `nefumeaza_ani` | existing `intake_fumat` (nu/da/ocazional) + new `intake_tigari_zi`, `intake_nefumeaza_ani` (shown when relevant) | map + new |
| `alcool_*`, `cafea_*`, `droguri_*`, `energ_*` | existing `intake_alcool`, `intake_cafea`, `intake_droguri`, `intake_energizant` | map it |
| `alergii` | existing `intake_alergii` (fallback `anamnesis.allergies`) | map it |
| `sport_perf` | existing `intake_sport_performanta` | map it |
| `tratamente` | existing `intake_tratamente_urmate` | map it |
| `bp_da/nu`, `bp_dg`, `bp_an` | existing `intake_boli_profesionale` + `_diagnostic`; new `intake_boli_profesionale_an` | map + new |
| `am_da/nu`, `am_dg`, `am_an` | existing `intake_accidente_munca` + `_diagnostic`; new `intake_accidente_munca_an` | map + new |
| `stagiu_da/nu` | existing `intake_stagiu_militar` | map it |

Check the existing stored value formats of the `intake_*` keys (yes/no vs da/nu) before mapping and handle both.
Validation: extend the anamnesis validation for angajare with the new keys (whitelist, enums, maxLength from the
new coordinates' widths ÷ 4.5). No schema change, no db push.

UI: the Anamneză step for angajare is reorganised to follow the dosar's order and headings (Date de identificare
→ Ruta profesională → Declarații → Antecedente heredo-colaterale → Antecedente personale → Condiții de viață →
Boli profesionale / accidente / stagiu militar), each with the „Dosar medical" sheet marker. Identity fields that
come from the employee record are shown read-only with a link „Corectează la angajat" (new tab), like the Funcție
line in the Aviz step.

Pre-sign checklist for angajare also lists empty Dosar medical positions (grey), and the employee-derived ones
(CNP, address, birth date) in red. Use the CNP presence rule from `resolveEmployeeCnp` (cnpEncrypted OR
idDocumentNumber) — never `idDocumentNumber` alone.

---

## Files you may touch
`public/templates/Dosar-Medical-BLANK.pdf` (Phase 0 only, via the generator), `scripts/templates/*` (new),
`lib/examinations/field_coordinates.json` (Dosar-Medical entries only), `lib/examinations/dosar-medical.ts` (new),
`lib/examinations/clinical-exam.ts`, `lib/examinations/periodic-sheet-map.ts` (generalise), `lib/examinations/sheet-checks.ts`,
`lib/examinations/document-templates.ts`, `app/api/examinations/[id]/route.ts` (validation),
`app/api/examinations/[id]/documents/[docKey]/route.ts` (`examen_angajare` and `dosar_medical` branches only),
`app/(authenticated)/examinations/[id]/**`, `components/examinations/sheet-marker.tsx`,
`messages/ro.json`, `messages/en.json`. Anything else: ask first.

## Ask the doctor (leave TODO(doctor) markers, do not guess)
- UM / N / A / S under „Antecedente personale fiziologice": confirm what each means and how she writes it.
- What goes in „Recomandări" on that same row.
- Ruta profesională: are 4 rows enough, and what format for „Perioadă" (e.g. 2015–2020)?

# Spec — Make the "control medical periodic" page show what lands on the printed sheet

Context: the periodic sheet mapping (docs/periodic-sheet-spec.md, phases 1–4) is done. The data is right, but the
doctor cannot see on the examination page **which fields print on "Examen medical periodic"**, **where** they
print, and **what to write** in the small free-text boxes. This change is presentation only.

**Scope: `control_periodic` only** (gate on `sections.showClinicalSystemsExam`, the flag already used for this
exam type). Every other exam type must render exactly as today.
**No changes** to: the Prisma schema, the PATCH route/validation, `buildPeriodicExamFields`, the documents route,
`pdf-fill.ts`, `field_coordinates.json`, fișa de aptitudine. If you think one is needed, stop and ask.

Two phases. After each: `npx tsc --noEmit` + Biome, `git diff --stat`, short summary, screenshots or a description
at 1366×768, then STOP for my OK. No production deploy without my approval.

---

## The idea in one line
Every input on the periodic page is visibly one of two things: **"Pe foaie · §N"** (prints on the sheet, at
section N) or **"Doar în Buzomed"** (kept in the record, never printed). Small text boxes say how much fits and
give a short example.

---

## Phase A — sheet map + markers

### A1. One map, one source of truth
New file `lib/examinations/periodic-sheet-map.ts`. It describes every input that appears on the periodic page:

```ts
export interface SheetRef {
  printed: boolean
  /** Where on the sheet, exactly as the doctor sees it on paper, e.g. "§5 Aparat respirator", "Antet",
   *  "Examene suplimentare", "Aviz medical". Omitted when printed === false. */
  where?: string
  /** One short sentence for the tooltip / help line. */
  hint?: string
  /** Short example shown as placeholder for free-text fields. */
  example?: string
}
```

- For items in `CLINICAL_EXAM_SECTIONS` / `CLINICAL_CONCLUSION_ITEMS` / `CLINICAL_SPECIALTY_CONCLUSION`, derive
  `printed: true` and `where: "§<section.number> <section.label>"` automatically from the definition — do not
  restate them. Add optional `hint?` / `example?` fields to the definition's item types instead and fill them
  from the table in A4.
- For everything else, a `PERIODIC_FIELD_REFS: Record<string, SheetRef>` keyed `"<bucket>.<key>"`
  (or the top-level field name). Use exactly this table:

| Field | printed | where | hint |
|---|---|---|---|
| `anamnesis.asymptomatic` | yes | Antet | Bifa „Asimpt.: Da / Nu" din antetul foii. |
| `vitalSigns.height`, `weight`, `bmi` | yes | Antet | T, G, IMC din antet. |
| obesity (computed) | yes | Antet | Se calculează automat din IMC (≥30 = Da, cu grad I/II/III). |
| `vitalSigns.bpSystolic`, `bpDiastolic`, `pulse` | yes | §6 Aparat cardiovascular | TA și AV pe rândul aparatului cardiovascular. |
| `vitalSigns.additionalNotes` | no | — | — |
| `visionTest.right`, `left`, `withCorrection` | yes | §10 Analizatori | Acuitate vizuală la distanță. |
| `visionTest.nearRight`, `nearLeft`, `nearCorrection` | yes | §10 Analizatori | Vedere de aproape. |
| `visionTest.colorResult` | yes | §10 Analizatori | SCN / Discromat. |
| `visionTest.colorPerception` | yes | §10 Analizatori | Nota de lângă vederea cromatică. |
| `visionTest.additionalNotes` | no | — | — |
| `hearingTest.voice` | yes | §10 Analizatori | Voce tare / șoptită. |
| `hearingTest.left`, `right`, `additionalNotes` | no | — | Valorile audiometriei nu au loc pe foaie; bifați „Audiograma" la examene suplimentare. |
| `lungFunction.*` | no | — | Valorile spirometriei nu au loc pe foaie; bifați „PFV" la examene suplimentare. |
| `anamnesis.*` (all other keys) | no | — | — |
| `additionalTests.ordered` | yes | Examene suplimentare | Bifele din grila de examene suplimentare. |
| `additionalTests.glycemia` | yes | Examene suplimentare | „Glicemie valoare: … mg/dl". |
| `additionalTests.laboratory`, `imaging`, `other` | no | — | — |
| `clinicalFindings` | yes | Concluziile examinării de specialitate | Apare și pe fișa de aptitudine. |
| `diagnoses` | no | — | — |
| `recommendations` | yes | Aviz medical → Recomandări | Apare și pe fișa de aptitudine, dacă „Condiții" e gol. |
| `verdict` | yes | Aviz medical | APT / APT CONDIȚIONAT / INAPT TEMPORAR / INAPT. |
| `verdictConditions` | no (on this sheet) | — | Apare doar pe fișa de aptitudine, nu pe foaia periodică. |
| `examinedAt` | yes | Antet + Data examinării | Data din antet și de jos. |
| `nextExaminationDueDate` | yes | Data următorului examen | — |
| `notes` | no | — | Note interne, nu apar pe niciun document. |

Also a read-only line in the Aviz step: **"Funcția: <employee.jobTitle>"** with hint "Se ia din fișa angajatului.
Dacă e greșită, corectați-o la angajat." — it prints in „AVIZ MEDICAL pentru exercitarea funcției de", and today the
doctor has no way to see it before printing. If `jobTitle` is empty, show it in amber: "Lipsește — câmpul va
rămâne gol pe foaie."

### A2. The marker
A tiny shared component `SheetMarker` next to each field label (and section heading where a whole section prints):
- printed → small pill: lucide `Printer` icon h-3 w-3 + the `where` text abbreviated to its § number or short name
  (`§5`, `Antet`, `Ex. supl.`, `Aviz`), `text-[11px]`, `bg-sky-50 text-sky-700 border-sky-200`
  (+ dark variants). Full `where` + `hint` in a tooltip. There is no tooltip component in components/ui — use
  the existing `popover.tsx` on hover/focus, or a native `title` as a fallback. Must work with keyboard focus.
- not printed → no pill on the field; instead see A3.

Put it in `examination-field-components.tsx` as an optional `sheetRef` prop on `Field`, `SelectField`,
`YesNoField`, `CheckField`, `FormSection` — absent prop = today's rendering, so other exam types are unchanged.

### A3. Group what does not print
In each periodic step, inputs that do not print are rendered together under a muted sub-block with a dashed border
and the heading **"Doar în dosarul din Buzomed — nu apare pe foaie"**. Do not delete or hide them; just group and
de-emphasise them (muted label colour). Where a whole existing section is non-printing (audiometry values,
spirometry values, free-text laboratory/imaging/other, diagnoses, internal notes), wrap the whole section.

### A4. Legend + step header line
- Once, above the step content (periodic only), a one-line legend:
  `🖨 Pe foaie = apare pe „Examen medical periodic" · câmpurile din chenarul punctat rămân doar în Buzomed`
  (use the `Printer` icon, not an emoji). Dismissible, remembered per user in localStorage (wrap in try/catch).
- At the top of each step, one muted line saying what of the sheet this step fills:
  - Anamneză: „Pe foaie: bifa Asimptomatic din antet."
  - Examen clinic: „Pe foaie: antetul (T, G, IMC, obezitate), punctele 1–11 și Concluzii examen clinic."
  - Investigații și concluzii: „Pe foaie: examenele suplimentare, glicemia și Concluziile examinării de specialitate."
  - Aviz: „Pe foaie: avizul, funcția, recomandările, data examinării și data următorului examen."

---

## Phase B — help for free text + live preview

### B1. Character counter that means something
Every free-text input that prints shows `n / max` under it (max from the existing `maxLength` /
`noteMaxLength` in the definition, or the PDF width rule for the others). At ≥ 80 % turn amber, at 100 % stop
input. When `max ≤ 15`, show the helper „Căsuța de pe foaie e mică — folosiți un cuvânt sau o abreviere."

### B2. Hints and examples
Show `example` as the input placeholder (prefixed „ex: ") and `hint` as a one-line muted help text. Use these;
mark the whole list with `// TODO(doctor): review wording` so the doctor can correct them:

| Field (note/text key) | example |
|---|---|
| `tegumente_nota` | paloare tegumentară |
| `ganglion_nota` | adenopatie laterocervicală dr. |
| `loco_nota` | mobilitate limitată umăr stg. |
| `torace_nota` | emfizematos |
| `ampl_nota` | diminuate dr. |
| `sonor_nota` | hipersonor |
| `murmur_nota` | diminuat |
| `varice` | absente |
| `ficat_nota` | hepatomegalie |
| `splina_nota` | palpabilă |
| `tranzit` | normal |
| `mictiuni_nota` | polakiurie |
| `nist_nota` | orizontal |
| `mers` | normal |
| `forta` (fortaSegmentara) | păstrată |
| `misc_invol` | tremor fin |
| `crom_nota` (colorPerception) | protanopie |
| `vap_corectie` (nearCorrection) | +1,5 D ODS |
| `endocrin` | tiroidă nepalpabilă |
| `concl_text` (clinical conclusion text) | HTA gr. I — control cardiologic |
| `clinicalFindings` | Sănătos clinic; fără contraindicații pentru post |
| `recommendations` | Purtarea ochelarilor de corecție |

Hints for the two choice items whose "Modificat" prints no checkbox (single-normal items such as Tegumente,
Ganglioni, Locomotor, Torace, Ampliații, Sonoritate, Murmur, Ficat, Splină, Micțiuni): when „Modificat" is selected,
the help line under the note reads „Pe foaie nu se bifează nimic — se tipărește doar nota." That is the one
behaviour doctors will otherwise find surprising.

### B3. "Vezi foaia completată"
In the stepper's bottom bar (periodic only), a secondary button **„Vezi foaia"** with the `FileText` icon:
saves first if dirty (reuse `handleSave({ silent: true })`; if the save fails, show the error and do not open),
then opens `/api/examinations/${id}/documents/examen_periodic` in a new tab. This is the existing route; do not
change it. Available in every step, including when locked/signed (then no save, just open).

---

## Files you may touch
- `lib/examinations/periodic-sheet-map.ts` (new)
- `lib/examinations/clinical-exam.ts` — only to add optional `hint` / `example` to item types and values
- `app/(authenticated)/examinations/[id]/examination-field-components.tsx`
- `app/(authenticated)/examinations/[id]/examination-stepper.tsx`
- `app/(authenticated)/examinations/[id]/steps/*`
- `app/(authenticated)/examinations/[id]/page.tsx` — only to pass `employee.jobTitle` down
- `components/examinations/sheet-marker.tsx` (new), if you prefer it outside field-components
- `messages/ro.json`, `messages/en.json`

## Verify
- Every input on a control_periodic exam has either a „Pe foaie" pill or sits in the dashed „Doar în Buzomed"
  block — list any input that has neither.
- A non-periodic exam (e.g. angajare, reluare_munca) renders identically to before.
- Fill one exam completely, click „Vezi foaia", and confirm every field marked „Pe foaie" is visible on the PDF
  at the section the pill names. Report any mismatch instead of fixing the PDF.
- 1366×768 and dark mode look right; keyboard focus shows the tooltips.

# Spec — Examen medical periodic: fill the official sheet from the examination

Goal: every position on `public/templates/Examen-medical-periodic-BLANK.pdf` (119 positions, coordinates in
`lib/examinations/field_coordinates.json` under the `p_` keys) can be filled from the examination page, so the
doctor no longer completes the printed sheet by hand.

**Scope: `control_periodic` ONLY.** Do not change behaviour for `angajare` or any other exam type, even though the
angajare sheet has the same positions without the `p_` prefix. Design the data so angajare can reuse it later
(see "Design rules"), but do not wire it up.

Work in **4 phases**. After each phase: run `npx tsc --noEmit` + Biome, show me `git diff --stat` and a short
summary, then STOP and wait for my OK before the next phase. Do not deploy to production without my approval.

---

## Design rules

1. **One declarative definition** of the clinical exam in a new file `lib/examinations/clinical-exam.ts`:
   an array of sections (1–11), each with items. Each item declares: `key`, Romanian `label`, `kind`
   (`choice` | `text`), its options (value, label, PDF checkbox key **without** the `p_` prefix), the `normal`
   value, an optional `noteKey` (PDF text key without prefix) and a `maxLength` for text.
   UI, validation, "all normal" and PDF mapping are all derived from this one definition. The PDF route adds the
   `p_` prefix for the periodic sheet — that is what makes angajare a later one-line change.
2. **Single source of truth for existing values.** TA, AV (pulse), height, weight, BMI, VOD/VOS/correction already
   live in `vitalSigns` / `visionTest`. Reuse them; never store them twice. Inside section 6 and 10 show them as
   the same inputs (bound to the same state), not copies.
3. **Storage:** one new column on `Examination`:
   `clinicalExam Json @default("{}") @map("clinical_exam")`. Apply with `npx prisma db push` (there is only one
   database and it is production — this change is additive and safe; do not use migrate dev, do not touch any
   other column). Supplementary exams go into the existing `additionalTests` bucket (keys below).
4. **Gating:** add flags to `ExamSectionConfig` in `lib/examinations/document-templates.ts`:
   `showClinicalSystemsExam` and `showSupplementaryExams`. `true` only for `control_periodic`; `false` in
   `FULL_CLINICAL` and everywhere else.
5. **Empty means not printed.** An item with no value prints nothing (no checkbox). Old examinations keep
   printing exactly as today.
6. **Text that does not fit is cut off on paper.** `pdf-fill.ts` draws one line per field at font size 8.
   Set every `maxLength` to roughly `floor(widthInPt / 4.5)` using the widths from field_coordinates.json, show a
   character counter in the UI, and enforce it in the PATCH validation. Exception: `concl_text`, `spec_text`,
   `recomandari` (531pt wide) — check whether pdf-lib wraps with `maxWidth` in our setup; if it wraps, allow up
   to 3 lines and confirm visually that nothing overlaps the next printed block.
7. Follow repo conventions: homegrown validation (`issues[]`, no zod), Biome, i18n strings in both
   `messages/ro.json` and `messages/en.json`.

---

## Field map

### Header (show in Clinic step, top)
| PDF keys | Source | Notes |
|---|---|---|
| `asimpt_da` / `asimpt_nu` | `anamnesis.asymptomatic`: `'da'` \| `'nu'` | Rendered in the **Anamneză** step (periodic only). Not touched by "all normal". |
| `inaltime`, `greutate`, `imc` | existing `vitalSigns` | already mapped |
| `obez_nu` / `obez_da`, `obez_gr` | **computed from BMI at print time** | BMI < 30 → Nu; ≥ 30 → Da + grade text: 30–34.9 "I", 35–39.9 "II", ≥ 40 "III". Show read-only in UI next to BMI. No stored field. |

### Sections 1–11 → `clinicalExam.<key>` (Clinic step)
Format: item — options (normal **bold**) — note key — kind.

1. Tegumente și mucoase — `tegumente`: **normal** (`tegumente_normal`) / modificat — note `tegumente_nota`
2. Țesut celular subcutanat — `tcs`: slab (`tcs_slab`) / **normal** (`tcs_normal`) / bine reprezentat (`tcs_bine`);
   `edeme`: **nu** (`edeme_nu`) / da (`edeme_da`)
3. Sistem ganglionar — `ganglioni`: **nepalpabil** (`ganglion_nepalpabil`) / modificat — note `ganglion_nota`
4. Aparat locomotor — `locomotor`: **integru** (`loco_integru`) / modificat — note `loco_nota`
5. Aparat respirator — `torace`: **normal** (`torace_normal`) / modificat — note `torace_nota`;
   `ampliatii`: **simetrice** (`ampl_simetrice`) / modificat — note `ampl_nota`;
   `sonoritate`: **normală** (`sonor_normala`) / modificat — note `sonor_nota`;
   `murmur`: **prezent** (`murmur_prezent`) / modificat — note `murmur_nota`;
   `raluri`: **nu** (`raluri_nu`) / da (`raluri_da`)
6. Aparat cardiovascular — TA (`ta`) and AV (`av`) = existing `vitalSigns` inputs;
   `ritm`: **regulat** (`ritm_regulat`) / neregulat (`ritm_neregulat`);
   `sufluri`: **nu** (`sufluri_nu`) / da (`sufluri_da`);
   `pulsPeriferic`: **prezent** (`puls_prezent`) / absent (`puls_absent`);
   `varice`: text (`varice`)
7. Aparat digestiv — `abdomen`: **nedureros** (`abd_nedureros`) / dureros (`abd_dureros`);
   when dureros: `abdomenPalpare`: superficial (`abd_super`) / profund (`abd_profund`);
   `ficat`: **în limite normale** (`ficat_normal`) / modificat — note `ficat_nota`;
   `splina`: **în limite normale** (`splina_normala`) / modificat — note `splina_nota`;
   `tranzit`: text (`tranzit`)
8. Aparat urogenital — `lojeRenale`: **libere** (`loje_libere`) / modificat;
   `giordano`: **negativ bilateral** (`giordano_neg`) / pozitiv (`giordano_poz`);
   `mictiuni`: **fiziologice** (`mictiuni_ok`) / modificat — note `mictiuni_nota`
9. Sistem nervos — `nistagmus`: **absent** (`nist_absent`) / prezent (`nist_prezent`) — note `nist_nota`;
   `romberg`: **negativ** (`romberg_neg`) / pozitiv (`romberg_poz`);
   `rot`: **prezente** (`rot_prezente`) / absente (`rot_absente`);
   `mers`: text (`mers`); `fortaSegmentara`: text (`forta`); `miscariInvoluntare`: text (`misc_invol`)
10. Analizatori — VOD/VOS/corecție = existing `visionTest.right/left/withCorrection` (`av_vod`, `av_vos`, `av_corectie`);
    **new inputs** `visionTest.nearRight`, `visionTest.nearLeft`, `visionTest.nearCorrection`
    (`vap_vod`, `vap_vos`, `vap_corectie` — note `vap_corectie` is not mapped today, add it);
    `visionTest.colorResult`: **scn** (`crom_scn`) / discromat (`crom_discromat`); existing free-text
    `visionTest.colorPerception` becomes its note → `crom_nota`;
    `hearingTest.voice`: tare (`voce_tare`) / șoptită (`voce_soptita`) — see "Ask the doctor", no default yet
11. Sistem endocrin — `endocrin`: text (`endocrin`)

**Concluzii examen clinic** (end of Clinic step) — `clinicalExam.conclusion`: **sanatos** (`concl_sanatos`) /
diagnostic (`concl_diag`); `clinicalExam.conclusionText` → `concl_text`.
**Today `concl_text` prints `clinicalFindings` — change it to `clinicalExam.conclusionText`.**

### "Modificat" semantics
For items with a single normal checkbox + note (e.g. tegumente): `normal` → checkbox printed; `modificat` →
checkbox not printed, note required (validation issue if empty). For two-option items the abnormal option
prints its own checkbox; a note, if the item has one, is optional.

### Free-text "normal" defaults
Text items (varice, tranzit, mers, forță, mișcări involuntare, endocrin) get their "all normal" text from one
exported constant `CLINICAL_EXAM_TEXT_DEFAULTS` in clinical-exam.ts. Initial values (to be confirmed by the
doctor — keep them in one place so I can change them):
varice "absente", tranzit "normal", mers "normal", forță "păstrată", mișcări involuntare "absente",
endocrin "fără modificări".

### Investigații și concluzii step (Constatări)
- **Examene suplimentare** → `additionalTests.ordered: string[]` of keys, rendered as a checkbox grid in the
  sheet's order: oftalmo, pfv, rpa, coproparaz, glicemie, orl, audio, ekg, hemo, clinic, neuro, psiho,
  psihiatric, coprobact, creatinina, carnet, sumar, medst, psihost, got, gpt, ggt, hcv, hbs, hiv, arma, altele
  → PDF `ex_<key>`. Labels exactly as printed on the sheet (ex. Oftalmologic, PFV, RPA, Ex. Coproparazit.,
  Glicemie, ex. ORL, Audiograma, EKG, Hemoleucogramă, Examen Clinic, ex. Neurologic, ex. Psihologic,
  ex. Psihiatric, Ex. Coprobact., Creatinină, Carnet de MM, Sumar urină, Medical ST, Psihologic ST, GOT, GPT,
  GGT, Ac HCV, Ag HBs, HIV, Port armă, Altele). Keep the existing free-text laboratory/imaging/other fields.
- `additionalTests.glycemia` (number, mg/dl) → `glicemie_val`; input shown only when Glicemie is checked.
- **Concluziile examinării de specialitate** → `clinicalExam.specialtyConclusion`: sanatos (`spec_sanatos`) /
  diagnostic (`spec_diag`); text stays the existing `clinicalFindings` → `spec_text` (unchanged, so the fișa de
  aptitudine renderings that show clinicalFindings are unaffected).
- No automatic pre-checking from the risk profile in this iteration.

### Aviz step
Unchanged — already maps aviz, funcție, recomandări, data examinării, data următorului examen.

---

## "Toate aparatele în limite normale" button
At the top of the sections 1–11 block (Clinic step, periodic only). Sets every **unset** item in sections 1–11
to its normal value (choice items) or its `CLINICAL_EXAM_TEXT_DEFAULTS` text, and `conclusion` to `sanatos`.
It never overwrites a value the doctor already entered. Show a toast "X câmpuri completate". Does not touch
vitals, vision values, asymptomatic, hearingTest.voice, or anything outside sections 1–11.

UI: each section is a compact collapsible block; a section where all items are normal collapses to a single
line "✓ În limite normale" with an "Editează" toggle. Choice items render as small segmented buttons, notes as
one-line inputs with a character counter. The page must stay usable on a 1366×768 laptop.

---

## Phases

**Phase 1 — data layer.** `clinical-exam.ts` definition + types + `parseClinicalExamInput()` validation
(whitelisted keys, allowed option values, maxLength, note-required rule). Schema column + `db push`. Add
`clinicalExam` to `JSONB_FIELDS` in `app/api/examinations/[id]/route.ts` with that validation; validate the new
`additionalTests.ordered` / `glycemia`, `visionTest.near*` / `colorResult`, `hearingTest.voice`,
`anamnesis.asymptomatic` keys. Section-config flags. No UI yet.

**Phase 2 — Clinic + Anamneză UI** (periodic only): asymptomatic toggle, obesity read-only, sections 1–11,
near vision + color result + voice inputs, "all normal" button, clinical conclusion. Wire into
`ExaminationFormValues`, `handleSave` payload and the server page's `initialValues`. Existing stepper
behaviour for other exam types must be byte-for-byte unchanged.

**Phase 3 — Investigații și concluzii UI** (periodic only): supplementary-exam grid, glycemia, specialty
conclusion status.

**Phase 4 — PDF mapping**: in `app/api/examinations/[id]/documents/[docKey]/route.ts`, `examen_periodic`
branch only: build fields from the definition with the `p_` prefix, add obesity computation, `vap_corectie`,
and switch `p_concl_text` to `clinicalExam.conclusionText`. Do not touch `examen_angajare`, `fisa_aptitudine`,
`fisa-pdf/*`, `pdf-fill.ts` or `field_coordinates.json` unless you ask me first.
Then generate a test sheet with every item set (mix of normal and abnormal, max-length notes) and render it to
PNG so I can check alignment. Also render one with an empty `clinicalExam` and confirm it matches today's output.

## Files you may touch
`prisma/schema.prisma` (one column), `lib/examinations/clinical-exam.ts` (new),
`lib/examinations/document-templates.ts`, `app/api/examinations/[id]/route.ts`,
`app/api/examinations/[id]/documents/[docKey]/route.ts`, `app/(authenticated)/examinations/[id]/page.tsx`,
`app/(authenticated)/examinations/[id]/examination-stepper.tsx`,
`app/(authenticated)/examinations/[id]/steps/*`, `app/(authenticated)/examinations/[id]/examination-field-components.tsx`,
new components under `app/(authenticated)/examinations/[id]/steps/` or `components/examinations/`,
`messages/ro.json`, `messages/en.json`. Anything else: ask first.

## Ask the doctor (do not guess — leave clearly marked TODOs)
- Voce tare / șoptită: which one is the normal result to tick?
- The free-text normal defaults above (wording he uses).
- Whether "Loje renale: libere" needs a note when not free (the sheet has no note box there).

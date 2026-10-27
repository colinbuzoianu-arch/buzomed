/**
 * Regenerates public/templates/Dosar-Medical-BLANK.pdf and rewrites the
 * "Dosar-Medical-BLANK.pdf" entry of lib/examinations/field_coordinates.json.
 *
 * Why this exists: the original blank was rebuilt by an external tool (no
 * script in the repo). Its light-blue input boxes were drawn ~6pt above their
 * labels, so every box overlapped the label of the row above, the Adresa /
 * Telefon and Ocupația / Formare rows were cramped, and the RUTA PROFESIONALĂ
 * table had headers but no row positions. This generator lays every input box
 * on the SAME baseline as its label, keeps ≥16pt between rows, and adds a
 * 4-row × 5-column ruta table — same text content and order as before.
 *
 * Run: npx tsx scripts/templates/build-dosar-medical.ts
 *
 * The box coordinates drive lib/examinations/pdf-fill.ts, which draws a value
 * at (x+2, y_bottom+2) and checkboxes centered — so a field's box is placed
 * with y_bottom = baseline - 2 (text) and the value lands on the label line.
 */

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'

interface Coord {
  page: number
  x: number
  y_bottom: number
  x2: number
  y_top: number
  type: 'text' | 'checkbox'
}

const ROOT = process.cwd()
const PAGE_W = 595.2756
const PAGE_H = 841.8898
const LEFT = 32
const RIGHT = 563.28
const TEXT_H = 13 // input box height for text fields
const CB = 9 // checkbox square size
const BOX_FILL = rgb(0.9, 0.95, 1)
const BOX_BORDER = rgb(0.72, 0.8, 0.9)

async function main() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const [reg, bold] = await Promise.all([
    doc.embedFont(await readFile(path.join(ROOT, 'public', 'fonts', 'Inter-Regular.ttf')), {
      subset: true,
    }),
    doc.embedFont(await readFile(path.join(ROOT, 'public', 'fonts', 'Inter-Bold.ttf')), {
      subset: true,
    }),
  ])
  const page = doc.addPage([PAGE_W, PAGE_H])
  const coords: Record<string, Coord> = {}

  const text = (t: string, x: number, baseline: number, size = 9, b = false) =>
    page.drawText(t, { x, y: baseline, size, font: b ? bold : reg, color: rgb(0, 0, 0) })
  const widthOf = (t: string, size = 9, b = false) =>
    (b ? bold : reg).widthOfTextAtSize(t, size)

  // A text input box whose value baseline lands on `baseline`.
  function textBox(key: string, x: number, baseline: number, x2: number) {
    const yb = baseline - 2
    page.drawRectangle({
      x,
      y: yb,
      width: x2 - x,
      height: TEXT_H,
      color: BOX_FILL,
      borderColor: BOX_BORDER,
      borderWidth: 0.5,
    })
    coords[key] = { page: 0, x, y_bottom: yb, x2, y_top: yb + TEXT_H, type: 'text' }
  }

  // A checkbox square placed at x, vertically centered on `baseline`.
  function checkBox(key: string, x: number, baseline: number) {
    const yb = baseline - 1
    page.drawRectangle({
      x,
      y: yb,
      width: CB,
      height: CB,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.45, 0.45, 0.45),
      borderWidth: 0.6,
    })
    coords[key] = { page: 0, x, y_bottom: yb, x2: x + CB, y_top: yb + CB, type: 'checkbox' }
    return x + CB
  }

  // Draw "<option>" then its checkbox; return the x after it.
  function option(labelTxt: string, key: string, x: number, baseline: number) {
    text(labelTxt, x, baseline)
    const after = x + widthOf(labelTxt) + 3
    const end = checkBox(key, after, baseline)
    return end + 10
  }

  // Wrap a long paragraph to width, returning the baseline after it.
  function paragraph(t: string, x: number, baseline: number, maxW: number, size = 7) {
    const words = t.split(' ')
    let line = ''
    let y = baseline
    const flush = () => {
      if (line) text(line, x, y, size)
    }
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (reg.widthOfTextAtSize(next, size) > maxW && line) {
        text(line, x, y, size)
        y -= size + 3
        line = w
      } else {
        line = next
      }
    }
    flush()
    return y
  }

  // ─── Title ────────────────────────────────────────────────────────────────
  const title = 'DOSAR MEDICAL'
  text(title, (PAGE_W - widthOf(title, 15, true)) / 2, 812, 15, true)

  let y = 790
  const row = (gap = 20) => {
    y -= gap
  }

  // Unitate (full width)
  text('Unitate:', LEFT, y, 9, true)
  textBox('unitate', LEFT + widthOf('Unitate:', 9, true) + 6, y, RIGHT)
  row()

  // Punct de lucru | Secția | Adresa unitate
  text('Punct de lucru:', LEFT, y, 9, true)
  textBox('punct_lucru', LEFT + widthOf('Punct de lucru:', 9, true) + 6, y, 250)
  text('Secția:', 262, y, 9, true)
  textBox('sectia', 262 + widthOf('Secția:', 9, true) + 6, y, 400)
  text('Adresa:', 410, y, 9, true)
  textBox('adresa_unitate', 410 + widthOf('Adresa:', 9, true) + 6, y, RIGHT)
  row()

  // Nume | Prenume
  text('Nume:', LEFT, y, 9, true)
  textBox('nume', LEFT + widthOf('Nume:', 9, true) + 6, y, 270)
  text('Prenume:', 285, y, 9, true)
  textBox('prenume', 285 + widthOf('Prenume:', 9, true) + 6, y, RIGHT)
  row()

  // Vârsta | Data nașterii | CNP/Pașaport | Sex
  text('Vârsta:', LEFT, y, 9, true)
  textBox('varsta', LEFT + widthOf('Vârsta:', 9, true) + 6, y, 120)
  text('Data nașterii:', 132, y, 9, true)
  textBox('data_nasterii', 132 + widthOf('Data nașterii:', 9, true) + 6, y, 285)
  text('CNP/Pașaport:', 300, y, 9, true)
  textBox('cnp', 300 + widthOf('CNP/Pașaport:', 9, true) + 6, y, 470)
  text('Sex:', 478, y, 9, true)
  textBox('sex', 478 + widthOf('Sex:', 9, true) + 6, y, RIGHT)
  row()

  // Adresa pacient | Telefon
  text('Adresa:', LEFT, y, 9, true)
  textBox('adresa_pacient', LEFT + widthOf('Adresa:', 9, true) + 6, y, 400)
  text('Telefon:', 410, y, 9, true)
  textBox('telefon', 410 + widthOf('Telefon:', 9, true) + 6, y, RIGHT)
  row()

  // Ocupația/funcția | Formare profesională
  text('Ocupația/funcția:', LEFT, y, 9, true)
  textBox('ocupatia', LEFT + widthOf('Ocupația/funcția:', 9, true) + 6, y, 300)
  text('Formare profesională:', 312, y, 9, true)
  textBox('formare', 312 + widthOf('Formare profesională:', 9, true) + 6, y, RIGHT)
  row(24)

  // ─── Ruta profesională table ────────────────────────────────────────────
  text('RUTA PROFESIONALĂ', LEFT, y, 10, true)
  row(16)
  const cols: Array<{ key: string; label: string; x: number; w: number }> = [
    { key: 'firma', label: 'FIRMA', x: LEFT, w: 150 },
    { key: 'post', label: 'POST DE MUNCĂ', x: LEFT + 150, w: 120 },
    { key: 'perioada', label: 'PERIOADĂ', x: LEFT + 270, w: 90 },
    { key: 'functia', label: 'FUNCȚIA', x: LEFT + 360, w: 90 },
    { key: 'noxa', label: 'NOXA', x: LEFT + 450, w: RIGHT - (LEFT + 450) },
  ]
  for (const c of cols) text(c.label, c.x + 2, y, 7, true)
  row(16)
  for (let r = 1; r <= 4; r++) {
    for (const c of cols) textBox(`ruta_${r}_${c.key}`, c.x, y, c.x + c.w)
    row(16)
  }
  row(6)

  // Activități | Medic de familie
  text('Activități îndeplinite la locul de muncă:', LEFT, y, 9, true)
  textBox(
    'activitati_loc_munca',
    LEFT + widthOf('Activități îndeplinite la locul de muncă:', 9, true) + 6,
    y,
    RIGHT
  )
  row()
  text('Medic de familie:', LEFT, y, 9, true)
  textBox('medic_familie', LEFT + widthOf('Medic de familie:', 9, true) + 6, y, RIGHT)
  row(22)

  // ─── Declarație ───────────────────────────────────────────────────────────
  text('Declar pe propria răspundere', LEFT, y, 9, true)
  row(13)
  y = paragraph(
    '- că nu sunt în evidență cu epilepsie, boli psihice, boli neurologice și nu sunt sub tratament pentru boli neuropsihice, diabet',
    LEFT,
    y,
    RIGHT - LEFT
  )
  row(13)
  y = paragraph(
    '- că nu sunt în evidență cu boli cronice, TBC sau alte boli infecto-contagioase și nu am avut contact cu bolnavi de TBC, hepatită sau HIV',
    LEFT,
    y,
    RIGHT - LEFT
  )
  row(13)
  y = paragraph(
    '- De asemenea îmi exprim consimțământul ca cabinetul medical să prelucreze datele mele cu caracter personal.',
    LEFT,
    y,
    RIGHT - LEFT
  )
  row(20)

  // Handicap
  {
    let x = LEFT
    text('Sunt înregistrat cu grad de handicap:', x, y, 9)
    x += widthOf('Sunt înregistrat cu grad de handicap:', 9) + 8
    x = option('NU', 'handicap_nu', x, y)
    option('DA', 'handicap_da', x, y)
  }
  row()

  // Grad de invaliditate + ITM
  {
    let x = LEFT
    text('Grad de invaliditate:', x, y, 9)
    x += widthOf('Grad de invaliditate:', 9) + 8
    x = option('NU', 'invalid_nu', x, y)
    x = option('DA', 'invalid_da', x, y)
    text('Gr:', x, y, 9)
    x += widthOf('Gr:', 9) + 4
    textBox('grad_inv', x, y, x + 50)
    x += 60
    text('în ITM:', x, y, 9)
    x += widthOf('în ITM:', 9) + 8
    x = option('NU', 'itm_nu', x, y)
    option('DA', 'itm_da', x, y)
  }
  row()

  // Semnătura
  text('Semnătura:', LEFT, y, 9)
  textBox('semnatura_pacient', LEFT + widthOf('Semnătura:', 9) + 6, y, 300)
  row(22)

  // Antecedente heredo-colaterale
  {
    text('Antecedente HEREDO-COLATERALE:', LEFT, y, 9, true)
    const bx = LEFT + widthOf('Antecedente HEREDO-COLATERALE:', 9, true) + 6
    textBox('antec_heredo', bx, y, 430)
    let x = 440
    text('Fără importanță patologică:', x, y, 8)
    x += widthOf('Fără importanță patologică:', 8) + 4
    checkBox('heredo_fara_imp', x, y)
  }
  row()

  // Antecedente personale fiziologice și patologice
  text('Antecedente personale fiziologice și patologice:', LEFT, y, 9, true)
  row(15)
  {
    let x = LEFT
    for (const [lbl, key] of [
      ['UM:', 'ap_um'],
      ['N:', 'ap_n'],
      ['A:', 'ap_a'],
      ['S:', 'ap_s'],
    ] as const) {
      text(lbl, x, y, 9)
      x += widthOf(lbl, 9) + 4
      textBox(key, x, y, x + 60)
      x += 70
    }
    text('Neagă patologice:', x, y, 8)
    x += widthOf('Neagă patologice:', 8) + 4
    checkBox('neaga_patologice', x, y)
  }
  row()
  text('Recomandări:', LEFT, y, 9)
  textBox('ap_recomandari', LEFT + widthOf('Recomandări:', 9) + 6, y, RIGHT)
  row(22)

  // Condiții de viață
  text('Condiții de viață:', LEFT, y, 10, true)
  row(16)

  // Fumat (+ țigări/zi, nu fumează de … ani)
  {
    let x = LEFT
    text('Fumat:', x, y, 9)
    x += widthOf('Fumat:', 9) + 6
    x = option('NU', 'fumat_nu', x, y)
    x = option('DA', 'fumat_da', x, y)
    x = option('Ocazional', 'fumat_ocaz', x, y)
    text('Câte țigări/zi:', x, y, 9)
    x += widthOf('Câte țigări/zi:', 9) + 4
    textBox('tigari_zi', x, y, x + 36)
    x += 46
    text('Nu fumează de:', x, y, 9)
    x += widthOf('Nu fumează de:', 9) + 4
    textBox('nefumeaza_ani', x, y, x + 30)
    x += 34
    text('ani', x, y, 9)
  }
  row()

  const habit = (lbl: string, nu: string, da: string, oc: string) => {
    let x = LEFT
    text(lbl, x, y, 9)
    x += widthOf(lbl, 9) + 6
    x = option('NU', nu, x, y)
    x = option('DA', da, x, y)
    option('Ocazional', oc, x, y)
    row()
  }
  habit('Alcool:', 'alcool_nu', 'alcool_da', 'alcool_ocaz')
  habit('Cafea:', 'cafea_nu', 'cafea_da', 'cafea_ocaz')
  habit('Droguri:', 'droguri_nu', 'droguri_da', 'droguri_ocaz')
  habit('Energizant:', 'energ_nu', 'energ_da', 'energ_ocaz')

  // Alergii | Sport | Tratamente
  text('Alergii:', LEFT, y, 9)
  textBox('alergii', LEFT + widthOf('Alergii:', 9) + 6, y, RIGHT)
  row()
  text('Sport de performanță:', LEFT, y, 9)
  textBox('sport_perf', LEFT + widthOf('Sport de performanță:', 9) + 6, y, RIGHT)
  row()
  text('Tratamente urmate:', LEFT, y, 9)
  textBox('tratamente', LEFT + widthOf('Tratamente urmate:', 9) + 6, y, RIGHT)
  row(22)

  // Boli profesionale / Accidente de muncă / Stagiul militar
  const dgRow = (lbl: string, da: string, nu: string, dg: string, an: string) => {
    let x = LEFT
    text(lbl, x, y, 9, true)
    x += widthOf(lbl, 9, true) + 8
    x = option('DA', da, x, y)
    x = option('NU', nu, x, y)
    text('Dg.', x, y, 9)
    x += widthOf('Dg.', 9) + 4
    textBox(dg, x, y, x + 230)
    x += 240
    text('Anul:', x, y, 9)
    x += widthOf('Anul:', 9) + 4
    textBox(an, x, y, x + 50)
    row()
  }
  dgRow('Boli profesionale:', 'bp_da', 'bp_nu', 'bp_dg', 'bp_an')
  dgRow('Accidente de muncă:', 'am_da', 'am_nu', 'am_dg', 'am_an')
  {
    let x = LEFT
    text('Stagiul militar:', x, y, 9, true)
    x += widthOf('Stagiul militar:', 9, true) + 8
    x = option('DA', 'stagiu_da', x, y)
    option('NU', 'stagiu_nu', x, y)
  }

  const pdfBytes = await doc.save()
  await writeFile(path.join(ROOT, 'public', 'templates', 'Dosar-Medical-BLANK.pdf'), pdfBytes)

  // Rewrite only the Dosar entry in field_coordinates.json, round to 2 decimals.
  const coordsPath = path.join(ROOT, 'lib', 'examinations', 'field_coordinates.json')
  const all = JSON.parse(await readFile(coordsPath, 'utf8'))
  const rounded: Record<string, Coord> = {}
  for (const [k, v] of Object.entries(coords)) {
    rounded[k] = {
      page: v.page,
      x: +v.x.toFixed(2),
      y_bottom: +v.y_bottom.toFixed(2),
      x2: +v.x2.toFixed(2),
      y_top: +v.y_top.toFixed(2),
      type: v.type,
    }
  }
  all['Dosar-Medical-BLANK.pdf'] = rounded
  await writeFile(coordsPath, `${JSON.stringify(all, null, 2)}\n`)

  console.log('wrote Dosar-Medical-BLANK.pdf and', Object.keys(coords).length, 'coordinates')
  console.log('lowest baseline used (y):', y.toFixed(1))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

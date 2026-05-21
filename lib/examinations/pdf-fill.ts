import path from 'path'
import { readFile } from 'fs/promises'
import {
  PDFDocument,
  PDFCheckBox,
  PDFTextField,
  PDFName,
  PDFDict,
  PDFString,
  rgb,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export interface TextOverlay {
  page: number
  x: number
  y: number
  text: string
  size?: number
}

// Geist-Regular (Next.js-bundled, open-source) covers the full Romanian
// character set — including Ș/ș, Ț/ț, Ă/ă and the cedilla variants Ş/ş, Ţ/ţ
// that standard Helvetica/WinAnsi cannot encode.
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf')

export async function fillExaminationPdf(
  templatePath: string,
  fields: Record<string, string | boolean>,
  overlays?: TextOverlay[],
  stampImageUrl?: string | null
): Promise<Uint8Array> {
  const [templateBytes, fontBytes] = await Promise.all([
    readFile(templatePath),
    readFile(FONT_PATH),
  ])

  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  pdfDoc.registerFontkit(fontkit)

  // Embed Unicode font once; used for both overlays and AcroForm field rendering.
  const unicodeFont = await pdfDoc.embedFont(fontBytes)

  const form = pdfDoc.getForm()

  // Fill AcroForm fields
  for (const [key, value] of Object.entries(fields)) {
    const field = form.getFieldMaybe(key)
    if (!field) continue

    if (typeof value === 'boolean') {
      if (field instanceof PDFCheckBox) {
        value ? field.check() : field.uncheck()
      }
    } else {
      if (field instanceof PDFTextField) {
        field.setText(value)
      }
    }
  }

  // Field appearance: light-blue background, no borders, font capped at 8pt.
  // The DA string provides the font SIZE (used by updateFieldAppearances);
  // the actual font is overridden by passing unicodeFont below.
  for (const field of form.getFields()) {
    try {
      if (field instanceof PDFTextField) {
        const da = field.acroField.dict.lookupMaybe(PDFName.of('DA'), PDFString)
        if (da) {
          const updated = da.decodeText().replace(/(\d+(?:\.\d+)?)\s+Tf/, (_, s) =>
            parseFloat(s) > 8 ? '8 Tf' : `${s} Tf`
          )
          field.acroField.dict.set(PDFName.of('DA'), PDFString.of(updated))
        }
      }

      for (const widget of field.acroField.getWidgets()) {
        const dict = widget.dict as PDFDict
        const mk = dict.lookupMaybe(PDFName.of('MK'), PDFDict)
        if (mk) {
          mk.set(PDFName.of('BG'), pdfDoc.context.obj([0.93, 0.96, 1.0]))
          mk.delete(PDFName.of('BC'))
        }
        dict.delete(PDFName.of('BS'))
      }
    } catch {
      // Never throw on individual field processing
    }
  }

  // Text overlays — use the Unicode font so Romanian chars render correctly.
  if (overlays && overlays.length > 0) {
    for (const ov of overlays) {
      const page = pdfDoc.getPage(ov.page)
      if (!page || !ov.text) continue
      page.drawText(ov.text, {
        x: ov.x,
        y: ov.y,
        size: ov.size ?? 8,
        font: unicodeFont,
        color: rgb(0, 0, 0),
      })
    }
  }

  // Stamp/parafa image — embedded before flatten so it merges into page content.
  // Fișa de Aptitudine has two vertically-stacked copies on one A4 page:
  //   Copy A (top half): fields at y ≈ 566–793 → stamp below last field
  //   Copy B (bottom half): fields at y ≈ 150–369 → stamp below last field
  if (stampImageUrl) {
    try {
      const res = await fetch(stampImageUrl)
      const imgBytes = await res.arrayBuffer()
      const isPng =
        stampImageUrl.toLowerCase().includes('.png') ||
        new Uint8Array(imgBytes)[0] === 0x89
      const embeddedImg = isPng
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes)

      const page = pdfDoc.getPage(0)
      page.drawImage(embeddedImg, { x: 380, y: 510, width: 80, height: 35 }) // Copy A
      page.drawImage(embeddedImg, { x: 380, y: 95,  width: 80, height: 35 }) // Copy B
    } catch (err) {
      console.warn('[pdf-fill] stamp image failed, skipping:', err)
    }
  }

  // Pass unicodeFont so all text fields are rendered with Romanian support.
  // This overrides the Helvetica/WinAnsi font referenced in each field's DA string.
  try {
    form.updateFieldAppearances(unicodeFont)
  } catch (err) {
    console.warn('[pdf-fill] updateFieldAppearances failed, continuing:', err)
  }

  try {
    form.flatten()
  } catch (err) {
    console.warn('[pdf-fill] flatten failed, saving without flatten:', err)
    return pdfDoc.save()
  }

  return pdfDoc.save()
}

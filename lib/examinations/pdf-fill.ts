import { readFile } from 'fs/promises'
import {
  PDFDocument,
  PDFCheckBox,
  PDFTextField,
  PDFName,
  PDFDict,
  PDFString,
  StandardFonts,
  rgb,
} from 'pdf-lib'

export interface TextOverlay {
  page: number
  x: number
  y: number
  text: string
  size?: number
}

export async function fillExaminationPdf(
  templatePath: string,
  fields: Record<string, string | boolean>,
  overlays?: TextOverlay[],
  stampImageUrl?: string | null
): Promise<Uint8Array> {
  const templateBytes = await readFile(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
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
  // Templates may still carry dark-blue BG or visible borders from authoring
  // tools; this loop normalises all widgets before updateFieldAppearances().
  for (const field of form.getFields()) {
    try {
      // Cap text-field font size at 8pt so filled values fit within small cells.
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
          // #EEF4FF ≈ rgb(0.93, 0.96, 1.0): light blue on screen, near-white in print
          mk.set(PDFName.of('BG'), pdfDoc.context.obj([0.93, 0.96, 1.0]))
          mk.delete(PDFName.of('BC')) // remove border colour → no visible outline
        }
        dict.delete(PDFName.of('BS')) // remove border stream
      }
    } catch {
      // Never throw on individual field processing
    }
  }

  // Text overlays — drawn after field fill, before flatten.
  // Used for static layout areas not exposed as AcroForm fields.
  if (overlays && overlays.length > 0) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    for (const ov of overlays) {
      const page = pdfDoc.getPage(ov.page)
      if (!page || !ov.text) continue
      page.drawText(ov.text, {
        x: ov.x,
        y: ov.y,
        size: ov.size ?? 8,
        font,
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

  // updateFieldAppearances() regenerates appearance streams with current values
  // so flatten() paints the correct text rather than a blank widget footprint
  try {
    form.updateFieldAppearances()
  } catch (err) {
    console.warn('[pdf-fill] updateFieldAppearances failed, continuing:', err)
  }

  try {
    form.flatten()
  } catch (err) {
    // If flatten throws (e.g. malformed appearance stream in template),
    // save without flattening — editable PDF is better than a broken one
    console.warn('[pdf-fill] flatten failed, saving without flatten:', err)
    return pdfDoc.save()
  }

  return pdfDoc.save()
}

import { readFile } from 'fs/promises'
import {
  PDFDocument,
  PDFCheckBox,
  PDFTextField,
  PDFName,
  PDFDict,
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

  // Strip visible borders and backgrounds from every field widget.
  // pdf-lib's flatten() preserves borders/backgrounds, which appear as
  // horizontal lines when the PDF is viewed in a browser.
  // Removing BS (border stream) and MK.BC/MK.BG (appearance characteristics)
  // from each widget's dictionary eliminates these artefacts.
  for (const field of form.getFields()) {
    try {
      for (const widget of field.acroField.getWidgets()) {
        const dict = widget.dict as PDFDict
        dict.delete(PDFName.of('BS'))
        const mk = dict.lookupMaybe(PDFName.of('MK'), PDFDict)
        if (mk) {
          mk.delete(PDFName.of('BC')) // border color
          mk.delete(PDFName.of('BG')) // background color
        }
      }
    } catch {
      // Some exotic field types don't expose widgets — skip silently
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

  // Stamp/signature image — embedded before flatten so it merges into page content
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
      page.drawImage(embeddedImg, { x: 380, y: 220, width: 80, height: 40 }) // Copy A
      page.drawImage(embeddedImg, { x: 380, y: 55,  width: 80, height: 40 }) // Copy B
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

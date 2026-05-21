import { readFile } from 'fs/promises'
import { PDFDocument, PDFCheckBox, PDFTextField, StandardFonts, rgb } from 'pdf-lib'

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
  const pdfDoc = await PDFDocument.load(templateBytes)
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

  // Text overlays — draw after field fill, before flatten
  // Used for static layout text not exposed as AcroForm fields
  if (overlays && overlays.length > 0) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    for (const ov of overlays) {
      const page = pdfDoc.getPage(ov.page)
      if (!page) continue
      if (!ov.text) continue
      page.drawText(ov.text, {
        x: ov.x,
        y: ov.y,
        size: ov.size ?? 8,
        font,
        color: rgb(0, 0, 0),
      })
    }
  }

  // Stamp/signature image — embedded before flatten so it's part of the flattened content
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
      // Copy A — signature/stamp area (bottom-right of first copy)
      page.drawImage(embeddedImg, { x: 380, y: 220, width: 80, height: 40 })
      // Copy B — corresponding area on second copy
      page.drawImage(embeddedImg, { x: 380, y: 55, width: 80, height: 40 })
    } catch (err) {
      console.warn('[pdf-fill] stamp image failed, skipping:', err)
    }
  }

  form.flatten()
  return pdfDoc.save()
}

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

  // Set light-blue background on all fields and remove visible borders.
  // #EEF4FF ≈ rgb(0.93, 0.96, 1.0): visible on screen, prints as near-white
  // so printed documents are clean and handwriting on top is easy.
  const FIELD_BG = rgb(0.93, 0.96, 1.0)

  for (const field of form.getFields()) {
    try {
      for (const widget of field.acroField.getWidgets()) {
        const dict = widget.dict as PDFDict

        // Primary: use the high-level API if available on this pdf-lib build
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mk = (widget as any).getOrCreateAppearanceCharacteristics()
          mk.setBackgroundColor(FIELD_BG)
        } catch {
          // Fallback: write BG directly into the MK (appearance characteristics) dict
          const mk = dict.lookupMaybe(PDFName.of('MK'), PDFDict)
          if (mk) {
            mk.set(PDFName.of('BG'), pdfDoc.context.obj([0.93, 0.96, 1.0]))
          }
        }

        // Remove border — always, regardless of which BG path ran above
        const mkDict = dict.lookupMaybe(PDFName.of('MK'), PDFDict)
        if (mkDict) mkDict.delete(PDFName.of('BC')) // border color
        dict.delete(PDFName.of('BS'))               // border stream
      }
    } catch {
      // Skip — never throw on individual field processing
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

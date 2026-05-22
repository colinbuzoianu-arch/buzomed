import path from 'path'
import { readFile } from 'fs/promises'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fieldCoords from './field_coordinates.json'

type FieldCoord = {
  page: number
  x: number
  y_bottom: number
  x2: number
  y_top: number
  type: 'text' | 'checkbox'
}

// Geist-Regular (Next.js-bundled) covers the full Romanian character set —
// including Ș/ș, Ț/ț, Ă/ă, Â/â, Î/î and the cedilla variants Ş/ş, Ţ/ţ.
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf')

export async function fillExaminationPdf(
  templateFile: string,
  fields: Record<string, string | boolean>
): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), 'public', 'templates', templateFile)
  const [templateBytes, fontBytes] = await Promise.all([
    readFile(templatePath),
    readFile(FONT_PATH),
  ])

  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)

  const coords = (fieldCoords as Record<string, Record<string, FieldCoord>>)[templateFile] ?? {}

  for (const [fieldName, value] of Object.entries(fields)) {
    const coord = coords[fieldName]
    if (!coord) continue

    const page = pdfDoc.getPage(coord.page)
    if (!page) continue

    const fieldHeight = coord.y_top - coord.y_bottom
    const fontSize = Math.min(8, fieldHeight - 2)

    if (coord.type === 'text' && typeof value === 'string' && value.trim()) {
      page.drawText(value, {
        x: coord.x + 2,
        y: coord.y_bottom + 2,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: coord.x2 - coord.x - 4,
      })
    } else if (coord.type === 'checkbox' && value === true) {
      const cx = coord.x + (coord.x2 - coord.x) / 2 - 3
      page.drawText('X', {
        x: cx,
        y: coord.y_bottom + 1,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
    }
  }

  return pdfDoc.save()
}

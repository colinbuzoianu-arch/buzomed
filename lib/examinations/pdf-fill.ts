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
      const maxWidth = coord.x2 - coord.x - 4

      if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) {
        // Fits on one line → EXACT original behaviour (unchanged positioning for
        // every short field on the official forms).
        page.drawText(value, {
          x: coord.x + 2,
          y: coord.y_bottom + 2,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          maxWidth,
        })
      } else {
        // Longer text (e.g. employer requirements + conditions in `recomandari`):
        // shrink the font until the word-wrapped lines fit the box height, then
        // draw them from the top down so nothing spills past the box edges.
        drawWrappedToFit(page, value, font, {
          x: coord.x + 2,
          yTop: coord.y_top,
          yBottom: coord.y_bottom,
          maxWidth,
          maxSize: fontSize,
        })
      }
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

/** Word-wraps `text` to `maxWidth` at a given font size. A single word wider
 *  than the box is kept on its own line (it can't be split). */
function wrapLines(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (!cur || font.widthOfTextAtSize(trial, size) <= maxWidth) {
      cur = trial
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Draws multi-line text that auto-shrinks to fit the field box (width AND
 *  height), top-anchored. Used only for text too long for one line, so short
 *  fields keep their original single-line rendering. */
function drawWrappedToFit(
  page: ReturnType<PDFDocument['getPage']>,
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  box: { x: number; yTop: number; yBottom: number; maxWidth: number; maxSize: number }
): void {
  const LINE_GAP = 1.5
  const MIN_SIZE = 4
  const height = box.yTop - box.yBottom

  let size = box.maxSize
  let lines = wrapLines(text, font, size, box.maxWidth)
  while (size > MIN_SIZE && lines.length * (size + LINE_GAP) > height) {
    size -= 0.5
    lines = wrapLines(text, font, size, box.maxWidth)
  }

  const lineHeight = size + LINE_GAP
  // Baseline of the first line, just under the top edge.
  let y = box.yTop - size
  for (const line of lines) {
    if (y < box.yBottom - 0.5) break // safety: never draw below the box
    page.drawText(line, { x: box.x, y, size, font, color: rgb(0, 0, 0) })
    y -= lineHeight
  }
}

import { readFile } from 'fs/promises'
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'

export async function fillExaminationPdf(
  templatePath: string,
  fields: Record<string, string | boolean>
): Promise<Uint8Array> {
  const templateBytes = await readFile(templatePath)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

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

  form.flatten()
  return pdfDoc.save()
}

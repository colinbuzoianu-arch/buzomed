import { renderToBuffer } from '@react-pdf/renderer'
import { randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { createServiceClient } from '@/lib/supabase/admin'
import { buildStoragePath } from '@/lib/documents/upload-rules'
import {
  buildFisaPdfData,
  type ExaminationForFisaPdf,
} from '@/app/api/examinations/[id]/fisa-pdf/fisa-pdf-data'
import { FisaPdfDocument } from '@/app/api/examinations/[id]/fisa-pdf/fisa-pdf-document'

export interface EnsureArchivedFisaResult {
  documentId: string
  storagePath: string
  filename: string
  /** Present only when this call generated the PDF; null if it already existed. */
  buffer: Uint8Array | null
  created: boolean
}

/**
 * Ensures the signed fișa de aptitudine for an examination exists as an
 * official `Document` in Supabase Storage, generating it once if needed.
 * Idempotent: a second call returns the existing record.
 *
 * Extracted from `POST /api/examinations/[id]/archive-fisa` so the cabinet
 * archive action AND the HR-portal download paths share one renderer. A single
 * source of truth matters here: a divergence would produce two different
 * "official" copies of the same legal document.
 *
 * The caller resolves the CNP to print (decrypting requires the acting user's
 * PII permission, which this function can't see) and must have already checked
 * that the examination is signed.
 */
export async function ensureArchivedFisa(
  examination: ExaminationForFisaPdf,
  opts: { tenantId: string; actorUserId: string; cnpValue: string }
): Promise<EnsureArchivedFisaResult> {
  const { tenantId, actorUserId, cnpValue } = opts

  const existing = await prisma.document.findFirst({
    where: {
      tenantId,
      entityType: 'examination',
      entityId: examination.id,
      documentType: 'fisa_aptitudine',
      isGenerated: true,
      deletedAt: null,
    },
    select: { id: true, storagePath: true, filename: true },
  })
  if (existing) {
    return {
      documentId: existing.id,
      storagePath: existing.storagePath,
      filename: existing.filename,
      buffer: null,
      created: false,
    }
  }

  const data = buildFisaPdfData(examination, cnpValue)

  let buffer: Uint8Array
  try {
    // biome-ignore lint/suspicious/noExplicitAny: react-pdf's element type doesn't line up with renderToBuffer's param
    buffer = await renderToBuffer(createElement(FisaPdfDocument, data) as any)
  } catch (err) {
    console.error('[ensureArchivedFisa] pdf render failed', err)
    throw new Error(`pdf_render_failed: ${String(err)}`)
  }

  const uniqueId = randomUUID()
  const safeNumber = examination.examinationNumber.replace('/', '-')
  const filename = `fisa_aptitudine_${safeNumber}.pdf`
  const storagePath = buildStoragePath({
    tenantId,
    entityType: 'examination',
    entityId: examination.id,
    uniqueId,
    filename,
  })

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    console.error('[ensureArchivedFisa] storage upload failed', uploadError)
    throw new Error(`storage_upload_failed: ${uploadError.message}`)
  }

  const doc = await prisma.document.create({
    data: {
      tenant: { connect: { id: tenantId } },
      entityType: 'examination',
      entityId: examination.id,
      documentType: 'fisa_aptitudine',
      filename,
      storagePath,
      mimeType: 'application/pdf',
      fileSizeBytes: BigInt(buffer.byteLength),
      isGenerated: true,
      isOfficial: true,
      issuedAt: examination.signedAt,
      signedBy: { connect: { id: actorUserId } },
    },
    select: { id: true },
  })

  return { documentId: doc.id, storagePath, filename, buffer, created: true }
}

import { renderToBuffer } from '@react-pdf/renderer'
import { randomUUID } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { getApiUser } from '@/lib/auth'
import { buildStoragePath } from '@/lib/documents/upload-rules'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { createServiceClient } from '@/lib/supabase/admin'
import { buildFisaPdfData, FISA_PDF_INCLUDE } from '../fisa-pdf/fisa-pdf-data'
import { FisaPdfDocument } from '../fisa-pdf/fisa-pdf-document'

/**
 * POST /api/examinations/[id]/archive-fisa
 *
 * Generates the fișa de aptitudine PDF and saves it as a Document record
 * linked to the examination. Idempotent — if an archived fișa already
 * exists for this examination, returns it without re-generating.
 *
 * The resulting document is marked isGenerated=true and isOfficial=true,
 * so it cannot be deleted through the Documents API.
 *
 * Requires: examination must already be signed (signedAt IS NOT NULL).
 * Auth: any user with write access in the tenant.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: examinationId } = await ctx.params
  const tenantId = auth.user.tenantId

  // Idempotency — return existing if already archived for this examination
  const existing = await prisma.document.findFirst({
    where: {
      tenantId,
      entityType: 'examination',
      entityId: examinationId,
      documentType: 'fisa_aptitudine',
      isGenerated: true,
      deletedAt: null,
    },
    select: { id: true, storagePath: true },
  })
  if (existing) {
    return NextResponse.json({ document: existing, alreadyExisted: true })
  }

  // Load examination with all data needed for PDF rendering
  const examination = await prisma.examination.findFirst({
    where: { id: examinationId, tenantId, deletedAt: null },
    include: FISA_PDF_INCLUDE,
  })

  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!examination.signedAt) {
    return NextResponse.json(
      { error: 'not_signed', message: 'Examination must be signed before archiving.' },
      { status: 400 }
    )
  }

  // Same payload builder the streaming fisa-pdf route uses, so the archived
  // copy can never disagree with what the browser shows.
  const data = buildFisaPdfData(examination)

  // Generate PDF
  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(FisaPdfDocument, data) as any)
  } catch (err) {
    console.error('[archive-fisa] pdf render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  // Upload to Supabase Storage
  const uniqueId = randomUUID()
  const safeNumber = examination.examinationNumber.replace('/', '-')
  const filename = `fisa_aptitudine_${safeNumber}.pdf`
  const storagePath = buildStoragePath({
    tenantId,
    entityType: 'examination',
    entityId: examinationId,
    uniqueId,
    filename,
  })

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    console.error('[archive-fisa] storage upload failed', uploadError)
    return NextResponse.json(
      { error: 'storage_upload_failed', message: uploadError.message },
      { status: 500 }
    )
  }

  // Create Document record
  const doc = await prisma.document.create({
    data: {
      tenant: { connect: { id: tenantId } },
      entityType: 'examination',
      entityId: examinationId,
      documentType: 'fisa_aptitudine',
      filename,
      storagePath,
      mimeType: 'application/pdf',
      fileSizeBytes: BigInt(buffer.byteLength),
      isGenerated: true,
      isOfficial: true,
      issuedAt: examination.signedAt,
      signedBy: { connect: { id: auth.user.id } },
    },
    select: { id: true, storagePath: true },
  })

  return NextResponse.json({ document: doc, alreadyExisted: false })
}

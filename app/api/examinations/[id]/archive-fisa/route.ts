import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canViewSensitivePii, canWriteTenantData } from '@/lib/permissions/tenant-data'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { prisma } from '@/lib/prisma'
import { ensureArchivedFisa } from '@/lib/fisa/ensure-archived'
import { FISA_PDF_INCLUDE } from '../fisa-pdf/fisa-pdf-data'

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
 *
 * The render/upload/Document.create itself lives in lib/fisa/ensure-archived
 * so the HR-portal download paths produce the exact same official copy.
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

  // CNP resolved here (gated on PII permission) since the pure builder can't
  // see the actor. Same gate as the streaming fisa-pdf route.
  const cnp = resolveEmployeeCnp(
    examination.employee,
    canViewSensitivePii(auth.user, tenantId)
  )
  if (cnp.error) {
    console.error('[archive-fisa] CNP decryption failed', {
      examinationId,
      employeeId: examination.employee.id,
    })
  }

  try {
    const result = await ensureArchivedFisa(examination, {
      tenantId,
      actorUserId: auth.user.id,
      cnpValue: cnp.value,
    })
    return NextResponse.json({
      document: { id: result.documentId, storagePath: result.storagePath },
      alreadyExisted: !result.created,
    })
  } catch (err) {
    const message = String(err)
    const status = message.includes('storage_upload_failed') ? 500 : 500
    console.error('[archive-fisa] failed', err)
    return NextResponse.json({ error: 'archive_failed', message }, { status })
  }
}

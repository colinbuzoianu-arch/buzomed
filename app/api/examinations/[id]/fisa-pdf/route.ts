import { renderToBuffer } from '@react-pdf/renderer'
import { type NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import { getClientIp, writeAuditLog } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { buildFisaPdfData, FISA_PDF_INCLUDE } from './fisa-pdf-data'
import { FisaPdfDocument } from './fisa-pdf-document'

/**
 * GET /api/examinations/[id]/fisa-pdf
 *
 * Generates and streams a PDF version of the fișa de aptitudine.
 * Uses @react-pdf/renderer which runs entirely in Node — no
 * Chromium, no Puppeteer, works on Vercel serverless.
 *
 * The PDF is generated on the fly and not cached. Examinations that
 * are unsigned get a "DRAFT" watermark text so a printed draft is
 * visually distinguishable from the signed original.
 *
 * Accessible to anyone with read access in the tenant (same rule as
 * the HTML fișa page — the document is meant to be reprinted by staff).
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: FISA_PDF_INCLUDE,
  })

  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Build the data payload for the PDF component — plain serializable
  // values only, no Prisma objects.
  const data = buildFisaPdfData(examination)

  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(FisaPdfDocument, data) as any)
  } catch (err) {
    console.error('[fisa-pdf] render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'download',
    entityType: 'examination',
    entityId: examination.id,
    entitySummary: `Fișă aptitudine ${examination.examinationNumber} — ${examination.employee.lastName} ${examination.employee.firstName}`,
    ipAddress: getClientIp(req),
  })

  const filename = `fisa_aptitudine_${examination.examinationNumber.replace('/', '-')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

import { renderToBuffer } from '@react-pdf/renderer'
import { type NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { createElement } from 'react'
import { getClientIp, writeAuditLog } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { avizePdfReady, buildAvizeWhere, readAvizeFilters } from '@/lib/examinations/avize-filters'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { canReadTenantData, canViewSensitivePii } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { buildFisaPdfData, FISA_PDF_INCLUDE } from '../[id]/fisa-pdf/fisa-pdf-data'
import { FisaPdfDocument } from '../[id]/fisa-pdf/fisa-pdf-document'

/**
 * GET /api/examinations/avize-pdf
 *
 * Merged PDF of every fișă in the current „Avize emise" filter, for the HR
 * handoff ("send me this month's certificates for company X").
 *
 * Guardrails: company AND period are both required, and the set is capped at
 * MAX_FISE so a careless filter can't try to render thousands of PDFs. Each
 * page is produced by the SAME generator as the single-fișă route
 * (buildFisaPdfData + FisaPdfDocument) and merged with pdf-lib, so the pages
 * are byte-for-byte what the individual download produces — including the CNP,
 * resolved under the acting user's PII permission exactly as the single route
 * does (assistants get the masked form). One audit entry records the bulk
 * export; individual-fișă downloads are not separately logged here.
 */

const MAX_FISE = 200

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const tenantId = auth.user.tenantId

  const { searchParams } = new URL(request.url)
  const filters = readAvizeFilters(Object.fromEntries(searchParams.entries()))

  if (!avizePdfReady(filters)) {
    return NextResponse.json(
      {
        error: 'filter_required',
        message: 'Selectează o companie și o perioadă înainte de a descărca toate fișele.',
      },
      { status: 400 }
    )
  }

  const where = buildAvizeWhere(tenantId, filters)
  const count = await prisma.examination.count({ where })

  if (count === 0) {
    return NextResponse.json(
      { error: 'empty', message: 'Nicio fișă în filtrul selectat.' },
      { status: 404 }
    )
  }
  if (count > MAX_FISE) {
    return NextResponse.json(
      {
        error: 'too_many',
        message: `Filtrul conține ${count} fișe, maximul este ${MAX_FISE}. Restrânge perioada.`,
      },
      { status: 400 }
    )
  }

  const [company, examinations] = await Promise.all([
    prisma.company.findFirst({
      where: { id: filters.companyId, tenantId, deletedAt: null },
      select: { name: true },
    }),
    prisma.examination.findMany({
      where,
      orderBy: [{ signedAt: 'desc' }],
      take: MAX_FISE,
      include: FISA_PDF_INCLUDE,
    }),
  ])

  const canPii = canViewSensitivePii(auth.user, tenantId)

  let merged: PDFDocument
  let anyDecrypted = false
  try {
    merged = await PDFDocument.create()
    for (const examination of examinations) {
      const cnp = resolveEmployeeCnp(examination.employee, canPii)
      if (cnp.decrypted) anyDecrypted = true
      const data = buildFisaPdfData(examination, cnp.value)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(createElement(FisaPdfDocument, data) as any)
      const doc = await PDFDocument.load(buffer)
      const pages = await merged.copyPages(doc, doc.getPageIndices())
      for (const p of pages) merged.addPage(p)
    }
  } catch (err) {
    console.error('[avize-pdf] merge failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  const bytes = await merged.save()

  await writeAuditLog({
    tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'examination',
    entitySummary: `Avize emise — ${company?.name ?? 'companie'} (${count} fișe)`,
    ipAddress: getClientIp(request),
    changes: {
      companyId: filters.companyId ?? null,
      period: filters.period ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null,
      count,
      includeRevoked: filters.includeRevoked,
      ...(anyDecrypted ? { cnpDecrypted: true } : {}),
    },
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `avize_${(company?.name ?? 'companie').replace(/[^a-z0-9]+/gi, '_')}_${stamp}.pdf`

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

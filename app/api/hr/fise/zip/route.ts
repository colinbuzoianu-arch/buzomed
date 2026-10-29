import { type NextRequest, NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import yazl from 'yazl'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/admin'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { getRequestMeta } from '@/lib/audit/log'
import { resolveHrScope } from '@/lib/hr/scope'
import { ensureArchivedFisa } from '@/lib/fisa/ensure-archived'
import { buildFiseWhere, fiseFileName, type FiseFilters } from '@/lib/hr/fise'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { FISA_PDF_INCLUDE } from '@/app/api/examinations/[id]/fisa-pdf/fisa-pdf-data'
import { asObject } from '@/lib/validation'

/** Hard cap per ZIP so one request can't try to build thousands of PDFs. */
const MAX_PER_ZIP = 500
const BUCKET = 'documents'

/**
 * POST /api/hr/fise/zip
 *
 * Bulk-downloads several signed fișe as one streamed ZIP. Accepts either an
 * explicit `examinationIds` list, or `all: true` + the same filters as the
 * list (to zip "toate din filtru"). Either way the server re-resolves which
 * examinations are in the HR user's scope — client-supplied ids are never
 * trusted. The ZIP is streamed, not buffered in memory.
 */
export async function POST(req: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.roles.includes('company_hr')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const scope = await resolveHrScope(auth.user.id)
  if (!scope.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const all = body.all === true
  const ids = Array.isArray(body.examinationIds)
    ? body.examinationIds.filter((x): x is string => typeof x === 'string')
    : []

  if (!all && ids.length === 0) {
    return NextResponse.json({ error: 'nothing_selected' }, { status: 400 })
  }

  // Always start from the scope-enforced where, then narrow to the requested
  // ids. This is what makes a forged id from another company impossible.
  const filters: FiseFilters = all ? (asObject(body.filters) ?? {}) : {}
  const where = buildFiseWhere(scope, filters)
  if (!all) where.id = { in: ids }

  const examinations = await prisma.examination.findMany({
    where,
    include: FISA_PDF_INCLUDE,
    orderBy: [{ examinedAt: 'desc' }, { completedAt: 'desc' }],
    take: MAX_PER_ZIP,
  })

  if (examinations.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const zip = new yazl.ZipFile()

  // Collect bytes for each fișă (freshly rendered, or downloaded from storage
  // if already archived) and add them to the stream. Done before we hand the
  // web stream to the Response so an error surfaces as a clean 500.
  const auditEntries: Array<{ id: string; summary: string; number: string }> = []
  const usedNames = new Set<string>()
  for (const exam of examinations) {
    const cnp = resolveEmployeeCnp(exam.employee, true)
    let bytes: Uint8Array | null = null
    try {
      const archived = await ensureArchivedFisa(exam, {
        tenantId: scope.tenantId,
        actorUserId: auth.user.id,
        cnpValue: cnp.value,
      })
      bytes = archived.buffer
      if (!bytes) {
        const dl = await supabase.storage.from(BUCKET).download(archived.storagePath)
        if (dl.error || !dl.data) throw new Error(dl.error?.message ?? 'download_failed')
        bytes = new Uint8Array(await dl.data.arrayBuffer())
      }
    } catch (err) {
      console.error('[hr/fise/zip] skipping fișă that failed to render', exam.id, err)
      continue
    }

    let name = fiseFileName({
      lastName: exam.employee.lastName,
      firstName: exam.employee.firstName,
      examinationNumber: exam.examinationNumber,
      examDate: resolveExaminationDate(exam).toISOString(),
    })
    // Guard against duplicate names within the archive.
    if (usedNames.has(name)) name = name.replace(/\.pdf$/, `_${exam.id.slice(0, 6)}.pdf`)
    usedNames.add(name)

    zip.addBuffer(Buffer.from(bytes), name)
    auditEntries.push({
      id: exam.id,
      summary: `${exam.employee.lastName} ${exam.employee.firstName}`,
      number: exam.examinationNumber,
    })
  }

  if (auditEntries.length === 0) {
    return NextResponse.json({ error: 'pdf_failed' }, { status: 500 })
  }

  zip.end()

  // One audit row per fișă so the cabinet's "Descărcată de HR" shows on each
  // examination. createMany keeps it a single write even for a 500-file ZIP.
  const { ipAddress, userAgent } = getRequestMeta(req)
  await prisma.auditLogEntry.createMany({
    data: auditEntries.map((e) => ({
      tenantId: scope.tenantId,
      userId: auth.user.id,
      action: 'read',
      entityType: 'examination',
      entityId: e.id,
      entitySummary: e.summary,
      changes: { hrDownload: true, fisaNumber: e.number, bulk: true },
      ipAddress,
      userAgent,
    })),
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const webStream = Readable.toWeb(zip.outputStream as unknown as Readable) as ReadableStream
  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="fise_${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}

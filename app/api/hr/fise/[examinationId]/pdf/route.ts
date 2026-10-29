import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'
import { resolveHrScope } from '@/lib/hr/scope'
import { fiseFileName } from '@/lib/hr/fise'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import {
  FISA_OFFICIAL_INCLUDE,
  renderOfficialFisaAptitudine,
} from '@/lib/examinations/fisa-aptitudine-official'

/**
 * GET /api/hr/fise/[examinationId]/pdf
 *
 * Streams the OFFICIAL fișa de aptitudine (the government AcroForm template,
 * the same PDF the cabinet prints at the end of an examination) for an HR user.
 *
 * The CNP IS included: by HG 355/2007 art. 17 the employer legally receives a
 * copy of the fișă, which carries the worker's CNP. The access is audited; the
 * CNP value itself is never written to a log.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ examinationId: string }> }) {
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

  const { examinationId } = await ctx.params

  const examination = await prisma.examination.findFirst({
    where: {
      id: examinationId,
      tenantId: scope.tenantId,
      deletedAt: null,
      signedAt: { not: null },
      workplace: {
        company: { id: { in: scope.companyIds }, publishFiseToHrPortal: true, deletedAt: null },
      },
    },
    include: FISA_OFFICIAL_INCLUDE,
  })

  // Collapse "not yours / unsigned / unpublished" into a single 404 — don't
  // confirm the existence of another company's examination.
  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // The employer is entitled to the fișă with the CNP on it.
  const cnp = resolveEmployeeCnp(examination.employee, true)
  if (cnp.error) {
    console.error('[hr/fise/pdf] CNP decryption failed', { examinationId })
  }

  let buffer: Uint8Array
  try {
    buffer = await renderOfficialFisaAptitudine(examination, cnp.value)
  } catch (err) {
    console.error('[hr/fise/pdf] pdf fill failed', err)
    return NextResponse.json({ error: 'pdf_failed' }, { status: 500 })
  }

  const filename = fiseFileName({
    lastName: examination.employee.lastName,
    firstName: examination.employee.firstName,
    examinationNumber: examination.examinationNumber,
    examDate: resolveExaminationDate(examination).toISOString(),
  })

  // Audit the HR download. The cabinet examination page reads these entries to
  // show "Descărcată de HR". CNP value is never logged.
  const { ipAddress, userAgent } = getRequestMeta(req)
  await writeAuditLog({
    tenantId: scope.tenantId,
    userId: auth.user.id,
    action: 'read',
    entityType: 'examination',
    entityId: examination.id,
    entitySummary: `${examination.employee.lastName} ${examination.employee.firstName}`,
    changes: { hrDownload: true, fisaNumber: examination.examinationNumber },
    ipAddress,
    userAgent,
  })

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

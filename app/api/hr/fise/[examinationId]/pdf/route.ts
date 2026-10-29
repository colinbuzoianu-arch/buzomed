import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/admin'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'
import { resolveHrScope } from '@/lib/hr/scope'
import { ensureArchivedFisa } from '@/lib/fisa/ensure-archived'
import { fiseFileName } from '@/lib/hr/fise'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { FISA_PDF_INCLUDE } from '@/app/api/examinations/[id]/fisa-pdf/fisa-pdf-data'

const BUCKET = 'documents'
const SIGNED_URL_TTL_SECONDS = 60

/**
 * GET /api/hr/fise/[examinationId]/pdf
 *
 * Returns a short-lived signed URL to the official fișa de aptitudine PDF for
 * an HR user. The fișă is generated/archived once via the shared helper, so
 * HR downloads the same official copy the cabinet produced.
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
    include: FISA_PDF_INCLUDE,
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

  let archived: Awaited<ReturnType<typeof ensureArchivedFisa>>
  try {
    archived = await ensureArchivedFisa(examination, {
      tenantId: scope.tenantId,
      actorUserId: auth.user.id,
      cnpValue: cnp.value,
    })
  } catch (err) {
    console.error('[hr/fise/pdf] archive failed', err)
    return NextResponse.json({ error: 'pdf_failed' }, { status: 500 })
  }

  const downloadName = fiseFileName({
    lastName: examination.employee.lastName,
    firstName: examination.employee.firstName,
    examinationNumber: examination.examinationNumber,
    examDate: resolveExaminationDate(examination).toISOString(),
  })

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(archived.storagePath, SIGNED_URL_TTL_SECONDS, { download: downloadName })

  if (error || !data?.signedUrl) {
    console.error('[hr/fise/pdf] signed URL creation failed', error)
    return NextResponse.json({ error: 'signed_url_failed' }, { status: 502 })
  }

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

  return NextResponse.json({ url: data.signedUrl, filename: downloadName, expiresInSeconds: SIGNED_URL_TTL_SECONDS })
}

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { sanitizeFilename } from '@/lib/reports/csv'
import { CompanyReportPdfDocument } from './company-report-pdf-document'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const url = new URL(req.url)
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')

  const fromDate = fromStr ? new Date(fromStr) : new Date(new Date().getFullYear(), 0, 1)
  const toDate = toStr ? new Date(new Date(toStr).getTime() + 86_400_000) : new Date()

  const [company, tenant] = await Promise.all([
    prisma.company.findFirst({
      where: { id, tenantId: auth.user.tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.tenant.findFirst({
      where: { id: auth.user.tenantId },
      select: { name: true, legalName: true },
    }),
  ])
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const cabinetName = tenant?.legalName ?? tenant?.name ?? 'Cabinet'

  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, tenantId: auth.user.tenantId, deletedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      jobTitle: true,
      examinations: {
        where: { deletedAt: null, signedAt: { not: null } },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: {
          signedAt: true,
          verdict: true,
          nextExaminationDueDate: true,
        },
      },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { workplace: { select: { name: true } } },
      },
    },
  })

  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      createdAt: { gte: fromDate, lt: toDate },
      workplace: { companyId: company.id, deletedAt: null },
    },
    select: { id: true, verdict: true },
  })

  const totalFit = examinations.filter(e => e.verdict === 'apt').length
  const totalRestricted = examinations.filter(e =>
    e.verdict === 'apt_conditionat' || e.verdict === 'inapt_temporar' || e.verdict === 'inapt'
  ).length

  function fmtDate(d: Date | null | undefined): string {
    if (!d) return '—'
    return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  }

  const workers = employees.map(e => {
    const lastExam = e.examinations[0] ?? null
    return {
      name: `${e.lastName} ${e.firstName}`,
      jobTitle: e.jobTitle ?? '',
      workplace: e.workplaceAssignments[0]?.workplace?.name ?? '',
      lastExamDate: fmtDate(lastExam?.signedAt),
      verdict: lastExam?.verdict ?? null,
      nextDue: fmtDate(lastExam?.nextExaminationDueDate),
    }
  })

  const docProps = {
    cabinetName,
    companyName: company.name,
    fromDate: fromStr ?? fmtDate(fromDate),
    toDate: toStr ?? fmtDate(new Date(toDate.getTime() - 86_400_000)),
    totalEmployees: employees.length,
    totalExaminations: examinations.length,
    totalFit,
    totalRestricted,
    workers,
    generatedAt: fmtDate(new Date()),
  }

  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(CompanyReportPdfDocument, docProps) as any)
  } catch (err) {
    console.error('[company-report-pdf] render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  const filename = `raport_${sanitizeFilename(company.name)}.pdf`
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { renderCsv, sanitizeFilename } from '@/lib/reports/csv'
import { writeAuditLog } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, tenantId: auth.user.tenantId, deletedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      jobTitle: true,
      isActive: true,
      archivedAt: true,
      examinations: {
        where: { deletedAt: null, signedAt: { not: null } },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: {
          signedAt: true,
          verdict: true,
          nextExaminationDueDate: true,
          examinationType: { select: { nameRo: true } },
        },
      },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { workplace: { select: { name: true } } },
      },
    },
  })

  const rows = [
    ['Nume', 'Prenume', 'Funcție', 'Loc de muncă', 'Stare', 'Ultima examinare', 'Verdict', 'Scadență'],
    ...employees.map(e => {
      const lastExam = e.examinations[0] ?? null
      const workplace = e.workplaceAssignments[0]?.workplace?.name ?? ''
      const status = e.archivedAt ? 'Arhivat' : e.isActive ? 'Activ' : 'Inactiv'
      return [
        e.lastName,
        e.firstName,
        e.jobTitle ?? '',
        workplace,
        status,
        lastExam?.signedAt ?? null,
        lastExam?.verdict ?? '',
        lastExam?.nextExaminationDueDate ?? null,
      ]
    }),
  ]

  const filename = `angajati_${sanitizeFilename(company.name)}.csv`

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'employees',
    entitySummary: `Export CSV — employees report`,
  })

  return new NextResponse(renderCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

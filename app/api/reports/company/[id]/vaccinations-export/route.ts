import { type NextRequest, NextResponse } from 'next/server'
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

  const vaccinations = await prisma.vaccination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      employee: { companyId: company.id, deletedAt: null },
    },
    orderBy: { administrationDate: 'desc' },
    select: {
      vaccineName: true,
      vaccineCode: true,
      doseNumber: true,
      administrationDate: true,
      nextDoseDueDate: true,
      manufacturer: true,
      batchNumber: true,
      administrationRoute: true,
      reactionsObserved: true,
      employee: { select: { lastName: true, firstName: true, jobTitle: true } },
      administeredBy: { select: { lastName: true, firstName: true } },
    },
  })

  const ROUTE_LABELS: Record<string, string> = {
    intramuscular: 'Intramuscular',
    subcutaneous: 'Subcutanat',
    oral: 'Oral',
    intranasal: 'Intranazal',
    other: 'Altul',
  }

  const rows = [
    ['Angajat', 'Funcție', 'Vaccin', 'Cod', 'Doza nr.', 'Data administrării', 'Data doză următoare', 'Producător', 'Nr. lot', 'Cale administrare', 'Reacții', 'Administrat de'],
    ...vaccinations.map(v => [
      `${v.employee.lastName} ${v.employee.firstName}`,
      v.employee.jobTitle ?? '',
      v.vaccineName,
      v.vaccineCode ?? '',
      v.doseNumber,
      v.administrationDate,
      v.nextDoseDueDate ?? null,
      v.manufacturer ?? '',
      v.batchNumber ?? '',
      v.administrationRoute ? (ROUTE_LABELS[v.administrationRoute] ?? v.administrationRoute) : '',
      v.reactionsObserved ?? '',
      `${v.administeredBy.lastName} ${v.administeredBy.firstName}`,
    ]),
  ]

  const filename = `vaccinari_${sanitizeFilename(company.name)}.csv`

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'vaccinations',
    entitySummary: `Export CSV — company vaccinations report`,
  })

  return new NextResponse(renderCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

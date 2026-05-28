import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { parseDateRange, resolveDateRange } from '@/lib/reports/date-ranges'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'
import { writeAuditLog } from '@/lib/audit/log'

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const rangeKey = parseDateRange(sp.get('range') ?? undefined)
  const range = resolveDateRange(rangeKey)

  const vaccinations = await prisma.vaccination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      administrationDate: {
        gte: range.from,
        lt: range.to,
      },
    },
    orderBy: { administrationDate: 'desc' },
    select: {
      vaccineName: true,
      vaccineCode: true,
      manufacturer: true,
      batchNumber: true,
      doseNumber: true,
      administrationDate: true,
      nextDoseDueDate: true,
      administrationRoute: true,
      reactionsObserved: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          jobTitle: true,
          company: { select: { name: true } },
        },
      },
      administeredBy: { select: { firstName: true, lastName: true } },
    },
  })

  const ROUTE_LABELS: Record<string, string> = {
    intramuscular: 'Intramuscular',
    subcutaneous: 'Subcutanat',
    oral: 'Oral',
    intranasal: 'Intranazal',
    other: 'Altul',
  }

  const headers: CsvRow = [
    'Angajat', 'Companie', 'Funcție',
    'Vaccin', 'Cod', 'Producător', 'Nr. lot',
    'Doza nr.', 'Data administrării', 'Doza următoare',
    'Cale administrare', 'Reacții', 'Medic',
  ]

  const rows: CsvRow[] = [
    headers,
    ...vaccinations.map(v => [
      `${v.employee.lastName} ${v.employee.firstName}`,
      v.employee.company?.name ?? '',
      v.employee.jobTitle ?? '',
      v.vaccineName,
      v.vaccineCode ?? '',
      v.manufacturer ?? '',
      v.batchNumber ?? '',
      String(v.doseNumber),
      v.administrationDate.toISOString().slice(0, 10),
      v.nextDoseDueDate ? v.nextDoseDueDate.toISOString().slice(0, 10) : '',
      v.administrationRoute ? (ROUTE_LABELS[v.administrationRoute] ?? v.administrationRoute) : '',
      v.reactionsObserved ?? '',
      v.administeredBy ? `${v.administeredBy.lastName} ${v.administeredBy.firstName}` : '',
    ]),
  ]

  const body = renderCsv(rows)
  const filename = sanitizeFilename(
    `vaccinari_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
  )

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'vaccinations',
    entitySummary: `Export CSV — vaccinations report`,
  })

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

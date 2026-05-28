import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { parseDateRange, resolveDateRange } from '@/lib/reports/date-ranges'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'
import { parseRiskProfile, RISK_PROFILE_SCHEMA } from '@/lib/workplaces/risk-profile'
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

  const workplaces = await prisma.workplace.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      isActive: true,
    },
    orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    select: {
      name: true,
      department: true,
      riskProfile: true,
      company: { select: { name: true } },
      employeeAssignments: {
        where: { isCurrent: true, employee: { deletedAt: null } },
        select: { employeeId: true },
      },
      examinations: {
        where: {
          tenantId: auth.user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
        },
        select: { id: true },
      },
    },
  })

  const headers: CsvRow = [
    'Companie', 'Loc de muncă', 'Departament',
    'Categorie noxă', 'Factor de risc',
    'Angajați activi', 'Examinări în interval',
  ]
  const rows: CsvRow[] = [headers]

  for (const wp of workplaces) {
    const rp = parseRiskProfile(wp.riskProfile)
    const activeEmployees = wp.employeeAssignments.length
    const examCount = wp.examinations.length

    let hasAnyHazard = false

    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (!entry?.present) continue
        hasAnyHazard = true
        rows.push([
          wp.company.name,
          wp.name,
          wp.department ?? '',
          category,
          hazardKey,
          String(activeEmployees),
          String(examCount),
        ])
      }
    }

    if (!hasAnyHazard) {
      rows.push([
        wp.company.name,
        wp.name,
        wp.department ?? '',
        '—',
        '—',
        String(activeEmployees),
        String(examCount),
      ])
    }
  }

  const body = renderCsv(rows)
  const filename = sanitizeFilename(
    `noxe_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
  )

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'workplaces',
    entitySummary: `Export CSV — hazards report`,
  })

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

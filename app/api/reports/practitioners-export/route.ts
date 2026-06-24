import { type NextRequest, NextResponse } from 'next/server'
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

  const practitioners = await prisma.user.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      roles: { hasSome: ['practitioner', 'practice_admin'] },
    },
    take: 1000,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: true,
      examinationsAsPractitioner: {
        where: {
          tenantId: auth.user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
        },
        select: { id: true, status: true, verdict: true, signedAt: true },
      },
    },
  })

  const headers: CsvRow = [
    'Practician', 'Rol', 'Total', 'Semnate',
    'Apt', 'Apt condiționat', 'Inapt temporar', 'Inapt',
  ]

  const rows: CsvRow[] = [
    headers,
    ...practitioners.map(p => {
      const exams = p.examinationsAsPractitioner
      const role = p.roles.includes('practice_admin') ? 'Medic primar' : 'Medic'
      return [
        `${p.lastName} ${p.firstName}`,
        role,
        String(exams.length),
        String(exams.filter(e => e.signedAt !== null).length),
        String(exams.filter(e => e.verdict === 'apt').length),
        String(exams.filter(e => e.verdict === 'apt_conditionat').length),
        String(exams.filter(e => e.verdict === 'inapt_temporar').length),
        String(exams.filter(e => e.verdict === 'inapt').length),
      ]
    }),
  ]

  const body = renderCsv(rows)
  const filename = sanitizeFilename(
    `practicieni_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
  )

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'practitioners',
    entitySummary: `Export CSV — practitioners report`,
  })

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

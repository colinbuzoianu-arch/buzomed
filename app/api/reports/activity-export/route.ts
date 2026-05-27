import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { parseDateRange, resolveDateRange } from '@/lib/reports/date-ranges'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'

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

  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      createdAt: { gte: range.from, lt: range.to },
    },
    take: 10000,
    orderBy: { createdAt: 'desc' },
    select: {
      examinationNumber: true,
      status: true,
      verdict: true,
      createdAt: true,
      signedAt: true,
      scheduledAt: true,
      employee: { select: { firstName: true, lastName: true } },
      examinationType: { select: { nameRo: true } },
      workplace: {
        select: {
          name: true,
          company: { select: { name: true } },
        },
      },
      practitioner: { select: { firstName: true, lastName: true } },
    },
  })

  const VERDICT_LABELS: Record<string, string> = {
    apt: 'Apt',
    apt_conditionat: 'Apt condiționat',
    inapt_temporar: 'Inapt temporar',
    inapt: 'Inapt',
  }

  const STATUS_LABELS: Record<string, string> = {
    scheduled: 'Programată',
    in_progress: 'În curs',
    completed: 'Finalizată',
    signed: 'Semnată',
    cancelled: 'Anulată',
    no_show: 'Absent',
  }

  const headers: CsvRow = [
    'Nr. examinare', 'Status', 'Data programării', 'Data semnării',
    'Angajat', 'Companie', 'Loc de muncă', 'Tip examinare',
    'Verdict', 'Medic',
  ]

  const rows: CsvRow[] = [
    headers,
    ...examinations.map(e => [
      e.examinationNumber,
      STATUS_LABELS[e.status] ?? e.status,
      e.scheduledAt ? e.scheduledAt.toISOString().slice(0, 10) : '',
      e.signedAt ? e.signedAt.toISOString().slice(0, 10) : '',
      `${e.employee.lastName} ${e.employee.firstName}`,
      e.workplace?.company.name ?? '',
      e.workplace?.name ?? '',
      e.examinationType.nameRo,
      e.verdict ? (VERDICT_LABELS[e.verdict] ?? e.verdict) : '',
      e.practitioner ? `${e.practitioner.lastName} ${e.practitioner.firstName}` : '',
    ]),
  ]

  const body = renderCsv(rows)
  const filename = sanitizeFilename(
    `activitate_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
  )

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

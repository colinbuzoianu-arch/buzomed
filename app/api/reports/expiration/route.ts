import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { renderCsv, sanitizeFilename } from '@/lib/reports/csv'

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const horizon = sp.get('horizon') ?? '90'

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cutoff = new Date(today)
  if (horizon !== 'overdue') {
    cutoff.setDate(cutoff.getDate() + Number(horizon))
  }

  const exams = await prisma.examination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      status: { notIn: ['cancelled', 'no_show'] },
      nextExaminationDueDate: {
        not: null,
        ...(horizon === 'overdue' ? { lt: today } : { lt: cutoff }),
      },
      employee: { deletedAt: null },
    },
    orderBy: { nextExaminationDueDate: 'asc' },
    select: {
      id: true,
      examinationNumber: true,
      createdAt: true,
      nextExaminationDueDate: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      workplace: {
        select: {
          name: true,
          department: true,
          company: { select: { name: true } },
        },
      },
    },
  })

  // Keep only most recent per employee
  const byEmployee = new Map<string, (typeof exams)[number]>()
  for (const e of exams) {
    const existing = byEmployee.get(e.employee.id)
    if (!existing || e.createdAt > existing.createdAt) {
      byEmployee.set(e.employee.id, e)
    }
  }
  const rows = Array.from(byEmployee.values()).sort(
    (a, b) => a.nextExaminationDueDate!.getTime() - b.nextExaminationDueDate!.getTime()
  )

  const headers = [
    'Angajat / Employee',
    'Companie / Company',
    'Loc de munca / Workplace',
    'Departament / Department',
    'Scadent la / Due date',
    'Zile ramase / Days left',
    'Nr. examinare / Exam no.',
    'Data ultima examinare / Last exam date',
  ]

  const csvRows = rows.map((row) => {
    const due = row.nextExaminationDueDate!
    const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
    return [
      `${row.employee.lastName} ${row.employee.firstName}`,
      row.workplace.company.name,
      row.workplace.name,
      row.workplace.department ?? '',
      due.toISOString().slice(0, 10),
      String(daysLeft),
      row.examinationNumber,
      row.createdAt.toISOString().slice(0, 10),
    ]
  })

  const filename = sanitizeFilename(`scadente_${today.toISOString().slice(0, 10)}`)
  const csv = renderCsv([headers, ...csvRows])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

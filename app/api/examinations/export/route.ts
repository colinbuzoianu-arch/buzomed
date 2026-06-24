import { type NextRequest, NextResponse } from 'next/server'
import type { ExaminationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'

/**
 * CSV export of the examinations list.
 *
 * Mirrors the filters available on the /examinations page so what
 * downloads matches what the user sees:
 *
 *   - status: optional ExaminationStatus
 *   - companyId: optional Company filter
 *   - from / to: optional ISO date range (inclusive `from`, exclusive `to`)
 *
 * No pagination — exports the full filtered set. We cap at 10,000 rows
 * defensively; if a cabinet has more than 10k exams matching the
 * filter, they should narrow it first. (10k rows is ~2-3 MB CSV — well
 * within Excel's tolerance and our function execution time budget.)
 *
 * Authorization: same as the page — canReadTenantData. Assistants CAN
 * export because they can already see the data in the table view; CSV
 * just transposes it to a different format.
 */

const VALID_STATUSES: ExaminationStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]

const EXPORT_LIMIT = 10_000

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status')
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as ExaminationStatus)
      ? (statusParam as ExaminationStatus)
      : null
  const companyId = searchParams.get('companyId') || null

  // Date range parsing. We accept YYYY-MM-DD here, matching the
  // examinations page's filter UI (currently none, but the export
  // route is also called by the per-company report which DOES filter
  // by date).
  function parseDateParam(raw: string | null): Date | null {
    if (!raw) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    const d = new Date(`${raw}T00:00:00.000Z`)
    return isNaN(d.getTime()) ? null : d
  }
  const fromDate = parseDateParam(searchParams.get('from'))
  const toDate = parseDateParam(searchParams.get('to'))
  // For `to`, advance one day so it's an exclusive upper bound.
  const toBound = toDate ? new Date(toDate.getTime() + 86_400_000) : null

  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: auth.user.tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(companyId
        ? { workplace: { companyId, deletedAt: null } }
        : {}),
      ...(fromDate || toBound
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toBound ? { lt: toBound } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: EXPORT_LIMIT,
    select: {
      examinationNumber: true,
      createdAt: true,
      scheduledAt: true,
      completedAt: true,
      signedAt: true,
      status: true,
      verdict: true,
      nextExaminationDueDate: true,
      employee: { select: { firstName: true, lastName: true } },
      workplace: {
        select: {
          name: true,
          department: true,
          company: { select: { name: true } },
        },
      },
      examinationType: { select: { nameRo: true, code: true } },
      practitioner: { select: { firstName: true, lastName: true } },
    },
  })

  // Header row. Romanian-first since this is a Romania-only product.
  // Bilingual headers (Ro / En) inline keep the file usable by non-RO
  // speakers without needing a separate export.
  const headers: CsvRow = [
    'Număr / Number',
    'Data deschidere / Created',
    'Data programare / Scheduled',
    'Data finalizare / Completed',
    'Data semnare / Signed',
    'Status',
    'Verdict',
    'Următoarea scadență / Next due',
    'Angajat / Worker',
    'Companie / Company',
    'Loc de muncă / Workplace',
    'Departament / Department',
    'Tip examen / Exam type',
    'Cod / Code',
    'Medic / Practitioner',
  ]

  const rows: CsvRow[] = [headers]
  for (const e of examinations) {
    rows.push([
      e.examinationNumber,
      e.createdAt,
      e.scheduledAt,
      e.completedAt,
      e.signedAt,
      e.status,
      e.verdict ?? '',
      e.nextExaminationDueDate,
      `${e.employee.lastName} ${e.employee.firstName}`,
      e.workplace.company.name,
      e.workplace.name,
      e.workplace.department ?? '',
      e.examinationType.nameRo,
      e.examinationType.code,
      e.practitioner
        ? `${e.practitioner.lastName} ${e.practitioner.firstName}`
        : '',
    ])
  }

  const body = renderCsv(rows)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = sanitizeFilename(`examinari_${stamp}.csv`)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Discourage caching — the same URL produces different content
      // as new exams get added.
      'Cache-Control': 'no-store',
    },
  })
}

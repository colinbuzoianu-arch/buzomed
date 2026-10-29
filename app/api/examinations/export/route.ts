import { type NextRequest, NextResponse } from 'next/server'
import type { ExaminationStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { buildExaminationListWhere, readExamListFilters } from '@/lib/examinations/list-filters'
import { buildAvizeWhere, readAvizeFilters } from '@/lib/examinations/avize-filters'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { renderCsv, sanitizeFilename, type CsvRow } from '@/lib/reports/csv'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'

/**
 * CSV export of the examinations list.
 *
 * Shares `buildExaminationListWhere` with the on-screen list so the file
 * contains exactly the rows the user sees for any filter combination.
 *
 * Backwards-compatible: the per-company report links here with
 * `companyId` + `from`/`to` and no `period`. That legacy shape keeps its
 * original `createdAt`-range semantics (so the report's numbers don't move);
 * only once the new list filters are used does the period switch to the
 * examination-date chain used on screen.
 *
 * Authorization: same as the page — canReadTenantData. Assistants can export
 * because they can already see the data in the table view.
 */

const VALID_STATUSES: ExaminationStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]

const EXPORT_LIMIT = 10_000

const VERDICT_LABEL: Record<string, string> = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const tenantId = auth.user.tenantId

  const { searchParams } = new URL(request.url)

  // „Avize emise" register export — its own where (signedAt period, verdict
  // present, revoked included by default) and column set (no PDF column).
  if (searchParams.get('register') === 'avize') {
    return exportAvizeRegister(tenantId, searchParams)
  }

  const statusParam = searchParams.get('status')
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as ExaminationStatus)
      ? (statusParam as ExaminationStatus)
      : null

  const filters = readExamListFilters(Object.fromEntries(searchParams.entries()))

  // Legacy per-company report path: from/to without any new filter → keep the
  // original createdAt-range behaviour so that report's numbers stay stable.
  const legacyMode =
    !filters.period &&
    !filters.type &&
    !filters.verdict &&
    !filters.practitionerId &&
    !filters.sign &&
    !filters.search &&
    (searchParams.get('from') || searchParams.get('to'))

  let where: Prisma.ExaminationWhereInput
  if (legacyMode) {
    const fromDate = parseDateParam(searchParams.get('from'))
    const toDate = parseDateParam(searchParams.get('to'))
    const toBound = toDate ? new Date(toDate.getTime() + 86_400_000) : null
    where = {
      tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(filters.companyId ? { workplace: { companyId: filters.companyId, deletedAt: null } } : {}),
      ...(fromDate || toBound
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toBound ? { lt: toBound } : {}),
            },
          }
        : {}),
    }
  } else {
    where = await buildExaminationListWhere(tenantId, status, filters)
  }

  const examinations = await prisma.examination.findMany({
    where,
    orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    take: EXPORT_LIMIT,
    select: {
      examinationNumber: true,
      examinedAt: true,
      completedAt: true,
      scheduledAt: true,
      createdAt: true,
      signedAt: true,
      verdict: true,
      verdictConditions: true,
      employee: { select: { firstName: true, lastName: true } },
      workplace: {
        select: {
          name: true,
          company: { select: { name: true } },
          workSite: { select: { name: true } },
        },
      },
      examinationType: { select: { nameRo: true } },
      practitioner: { select: { firstName: true, lastName: true } },
    },
  })

  const headers: CsvRow = [
    'Nr.',
    'Data',
    'Angajat',
    'Companie',
    'Loc de muncă',
    'Tip',
    'Aviz',
    'Condiții',
    'Medic',
    'Semnat la',
  ]

  const rows: CsvRow[] = [headers]
  for (const e of examinations) {
    rows.push([
      e.examinationNumber,
      resolveExaminationDate(e),
      `${e.employee.lastName} ${e.employee.firstName}`,
      e.workplace.company.name,
      formatWorkplaceLabel(e.workplace),
      e.examinationType.nameRo,
      e.verdict ? (VERDICT_LABEL[e.verdict] ?? e.verdict) : '',
      e.verdictConditions ?? '',
      e.practitioner ? `${e.practitioner.lastName} ${e.practitioner.firstName}` : '',
      e.signedAt,
    ])
  }

  const body = renderCsv(rows)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = sanitizeFilename(`examinari_${stamp}.csv`)

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** CSV of the „Avize emise" register — the list columns minus the PDF link. */
async function exportAvizeRegister(
  tenantId: string,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  const filters = readAvizeFilters(Object.fromEntries(searchParams.entries()))
  const where = buildAvizeWhere(tenantId, filters)

  const examinations = await prisma.examination.findMany({
    where,
    orderBy: [{ signedAt: 'desc' }],
    take: EXPORT_LIMIT,
    select: {
      examinationNumber: true,
      examinedAt: true,
      completedAt: true,
      createdAt: true,
      verdict: true,
      verdictConditions: true,
      nextExaminationDueDate: true,
      revokedAt: true,
      employee: { select: { firstName: true, lastName: true } },
      workplace: {
        select: {
          name: true,
          company: { select: { name: true } },
          workSite: { select: { name: true } },
        },
      },
      examinationType: { select: { nameRo: true } },
      practitioner: { select: { firstName: true, lastName: true } },
    },
  })

  const headers: CsvRow = [
    'Nr. fișă',
    'Data examinării',
    'Angajat',
    'Companie',
    'Loc de muncă',
    'Tip',
    'Aviz',
    'Condiții',
    'Valabil până la',
    'Medic',
    'Retrasă',
  ]

  const rows: CsvRow[] = [headers]
  for (const e of examinations) {
    rows.push([
      e.examinationNumber,
      resolveExaminationDate(e),
      `${e.employee.lastName} ${e.employee.firstName}`,
      e.workplace.company.name,
      formatWorkplaceLabel(e.workplace),
      e.examinationType.nameRo,
      e.verdict ? (VERDICT_LABEL[e.verdict] ?? e.verdict) : '',
      e.verdictConditions ?? '',
      e.nextExaminationDueDate,
      e.practitioner ? `${e.practitioner.lastName} ${e.practitioner.firstName}` : '',
      e.revokedAt ? 'Da' : '',
    ])
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = sanitizeFilename(`avize_${stamp}.csv`)
  return new NextResponse(renderCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

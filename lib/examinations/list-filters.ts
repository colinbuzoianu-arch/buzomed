import type { ExaminationStatus, ExaminationVerdict, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FOLD_FROM, FOLD_TO, normalizeTerm } from '@/lib/search/normalize'
import { bucharestMidnightUtc, bucharestYmd } from '@/lib/time/bucharest'

/**
 * Shared filtering for the examinations list views (the programate / in_curs /
 * finalizate / toate tabs) and the CSV export, so the screen and the file
 * return exactly the same rows for any filter combination.
 *
 * The period filter runs on the *examination date*, which is the fallback
 * chain examinedAt → completedAt → scheduledAt. Prisma can't filter a
 * COALESCE, so the range is expressed as the equivalent precedence OR.
 */

export const PERIODS = ['azi', '7zile', 'luna', 'luna_trecuta', 'an', 'custom'] as const
export type Period = (typeof PERIODS)[number]

export const VERDICT_FILTERS = ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt', 'none'] as const
export const SIGN_FILTERS = ['semnate', 'nesemnate', 'retrase'] as const

export interface ExamListFilters {
  period?: string
  from?: string
  to?: string
  type?: string
  verdict?: string
  companyId?: string
  practitionerId?: string
  sign?: string
  search?: string
}

/** Pull the recognised filter params out of a loose searchParams bag. */
export function readExamListFilters(params: Record<string, string | undefined>): ExamListFilters {
  return {
    period: params.period,
    from: params.from,
    to: params.to,
    type: params.type,
    verdict: params.verdict,
    companyId: params.companyId,
    practitionerId: params.practitionerId,
    sign: params.sign,
    search: params.search,
  }
}

/** True when at least one list filter (not counting the tab) is active. */
export function hasActiveExamFilters(f: ExamListFilters): boolean {
  return Boolean(
    f.period || f.type || f.verdict || f.companyId || f.practitionerId || f.sign || f.search
  )
}

function parseYmd(raw: string | undefined): { y: number; m: number; d: number } | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split('-').map(Number)
  return { y, m, d }
}

/** Resolve a period (+ optional custom from/to) to a UTC [from, to) range. */
export function resolvePeriodRange(
  period: string | undefined,
  from?: string,
  to?: string,
  now: Date = new Date()
): { from: Date | null; to: Date | null } {
  if (!period) return { from: null, to: null }
  const { y, m, d } = bucharestYmd(now)
  const dayStart = bucharestMidnightUtc(y, m, d)
  const nextDay = (base: Date) => new Date(base.getTime() + 24 * 60 * 60 * 1000)

  switch (period) {
    case 'azi':
      return { from: dayStart, to: nextDay(dayStart) }
    case '7zile':
      return { from: new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000), to: nextDay(dayStart) }
    case 'luna':
      return { from: bucharestMidnightUtc(y, m, 1), to: bucharestMidnightUtc(y, m + 1, 1) }
    case 'luna_trecuta':
      return { from: bucharestMidnightUtc(y, m - 1, 1), to: bucharestMidnightUtc(y, m, 1) }
    case 'an':
      return { from: bucharestMidnightUtc(y, 1, 1), to: bucharestMidnightUtc(y + 1, 1, 1) }
    case 'custom': {
      const f = parseYmd(from)
      const t = parseYmd(to)
      return {
        from: f ? bucharestMidnightUtc(f.y, f.m, f.d) : null,
        // inclusive upper bound → advance one day
        to: t ? bucharestMidnightUtc(t.y, t.m, t.d + 1) : null,
      }
    }
    default:
      return { from: null, to: null }
  }
}

/** The examination-date range as a precedence-correct OR (examinedAt → completedAt → scheduledAt). */
function examinationDateWhere(range: {
  from: Date | null
  to: Date | null
}): Prisma.ExaminationWhereInput | null {
  if (!range.from && !range.to) return null
  const bounds = {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lt: range.to } : {}),
  }
  return {
    OR: [
      { examinedAt: bounds },
      { examinedAt: null, completedAt: bounds },
      { examinedAt: null, completedAt: null, scheduledAt: bounds },
    ],
  }
}

/**
 * Diacritics-insensitive lookup of employee ids whose name matches `q`, for
 * the text search (the list query itself stays a Prisma call). Bounded; the
 * employee table is tenant-scoped and small.
 */
async function matchEmployeeIds(tenantId: string, q: string): Promise<string[]> {
  const like = `%${normalizeTerm(q)}%`
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM employees
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND (
        translate(lower(last_name || ' ' || first_name), ${FOLD_FROM}, ${FOLD_TO}) LIKE ${like}
        OR translate(lower(first_name || ' ' || last_name), ${FOLD_FROM}, ${FOLD_TO}) LIKE ${like}
      )
    LIMIT 2000
  `
  return rows.map((r) => r.id)
}

/**
 * Build the full Prisma where for the examinations list / export.
 * `status` comes from the active tab (null = all).
 */
export async function buildExaminationListWhere(
  tenantId: string,
  status: ExaminationStatus | null,
  f: ExamListFilters
): Promise<Prisma.ExaminationWhereInput> {
  const and: Prisma.ExaminationWhereInput[] = []

  const dateWhere = examinationDateWhere(resolvePeriodRange(f.period, f.from, f.to))
  if (dateWhere) and.push(dateWhere)

  if (f.search?.trim()) {
    const q = f.search.trim()
    const ids = await matchEmployeeIds(tenantId, q)
    and.push({
      OR: [
        ...(ids.length ? [{ employeeId: { in: ids } }] : []),
        { examinationNumber: { contains: q, mode: 'insensitive' as const } },
      ],
    })
  }

  const verdictWhere: Prisma.ExaminationWhereInput =
    f.verdict === 'none'
      ? { verdict: null }
      : f.verdict && (VERDICT_FILTERS as readonly string[]).includes(f.verdict)
        ? { verdict: f.verdict as ExaminationVerdict }
        : {}

  const signWhere: Prisma.ExaminationWhereInput =
    f.sign === 'semnate'
      ? { signedAt: { not: null }, revokedAt: null }
      : f.sign === 'nesemnate'
        ? { signedAt: null }
        : f.sign === 'retrase'
          ? { revokedAt: { not: null } }
          : {}

  return {
    tenantId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(f.type ? { examinationTypeId: f.type } : {}),
    ...(f.companyId ? { workplace: { companyId: f.companyId, deletedAt: null } } : {}),
    ...(f.practitionerId ? { practitionerId: f.practitionerId } : {}),
    ...verdictWhere,
    ...signWhere,
    ...(and.length ? { AND: and } : {}),
  }
}

import type { Prisma } from '@prisma/client'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'
import type { HrScope } from './scope'

/**
 * Query + mapping logic for the HR-portal "Fișe de aptitudine" list.
 *
 * Kept separate from the route so the company-isolation rule (an HR user of
 * company A never sees company B) is a pure, unit-testable function, and so the
 * list route and the bulk-ZIP route build the exact same filter.
 *
 * HARD RULE: only fields printed on the fișa de aptitudine leave here. No
 * clinical columns, and in particular never `revocationReason` (free
 * practitioner text that may contain medical info).
 */

type Scope = Extract<HrScope, { ok: true }>

export interface FiseFilters {
  companyId?: string
  workplaceId?: string
  verdict?: string
  examinationTypeId?: string
  /** Exam-date range (inclusive), ISO yyyy-mm-dd. */
  from?: string
  to?: string
  /** Free-text name search; each term must match first or last name. */
  search?: string
}

/** Columns the list needs — deliberately no clinical fields. */
export const FISE_LIST_SELECT = {
  id: true,
  examinationNumber: true,
  verdict: true,
  nextExaminationDueDate: true,
  examinedAt: true,
  completedAt: true,
  createdAt: true,
  revokedAt: true,
  // The employer's own request for this certificate (not medical). HR may see
  // it; it is never placed in a medical summary.
  employerRequirementsSnapshot: true,
  employee: { select: { firstName: true, lastName: true, jobTitle: true } },
  workplace: {
    select: { id: true, name: true, companyId: true, workSite: { select: { name: true } } },
  },
  examinationType: { select: { code: true, nameRo: true } },
  supersededBy: { select: { examinationNumber: true } },
} satisfies Prisma.ExaminationSelect

export type ExaminationForFiseList = Prisma.ExaminationGetPayload<{
  select: typeof FISE_LIST_SELECT
}>

/**
 * Is a company visible to this HR scope? The single source of truth behind the
 * isolation guarantee; the Prisma where below encodes exactly this.
 */
export function companyVisibleToHr(
  companyId: string,
  scope: Scope,
  requestedCompanyId?: string
): boolean {
  if (!scope.companyIds.includes(companyId)) return false
  if (requestedCompanyId && companyId !== requestedCompanyId) return false
  return true
}

/**
 * Builds the Prisma `where` for signed, HR-visible fișe. Company scoping is
 * enforced through the workplace's company: it must be one of the HR user's
 * assigned companies AND have `publishFiseToHrPortal` on.
 */
export function buildFiseWhere(scope: Scope, filters: FiseFilters): Prisma.ExaminationWhereInput {
  const companyId =
    filters.companyId && scope.companyIds.includes(filters.companyId)
      ? filters.companyId
      : { in: scope.companyIds }

  const where: Prisma.ExaminationWhereInput = {
    tenantId: scope.tenantId,
    signedAt: { not: null }, // drafts/unsigned never appear
    deletedAt: null,
    workplace: {
      company: {
        id: companyId,
        publishFiseToHrPortal: true,
        deletedAt: null,
      },
      ...(filters.workplaceId ? { id: filters.workplaceId } : {}),
    },
  }

  if (filters.verdict) {
    where.verdict = filters.verdict as Prisma.ExaminationWhereInput['verdict']
  }
  if (filters.examinationTypeId) {
    where.examinationTypeId = filters.examinationTypeId
  }

  // Name search: every term must match the first or last name.
  const terms = (filters.search ?? '').trim().split(/\s+/).filter(Boolean)
  if (terms.length > 0) {
    where.AND = terms.map((term) => ({
      employee: {
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      },
    }))
  }

  // Exam-date range, matching resolveExaminationDate's examinedAt→completedAt
  // chain (the createdAt tail only affects pre-examinedAt rows, virtually none
  // of which are signed).
  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {}
    if (filters.from) range.gte = new Date(`${filters.from}T00:00:00.000Z`)
    if (filters.to) range.lte = new Date(`${filters.to}T23:59:59.999Z`)
    where.OR = [
      { examinedAt: range },
      { AND: [{ examinedAt: null }, { completedAt: range }] },
    ]
  }

  return where
}

export interface FiseListRow {
  id: string
  examinationNumber: string
  companyId: string
  workplaceId: string
  lastName: string
  firstName: string
  jobTitle: string | null
  workplaceName: string
  examTypeCode: string
  examTypeName: string
  verdict: string | null
  examDate: string
  nextDueDate: string | null
  isRevoked: boolean
  revokedAt: string | null
  replacementNumber: string | null
  /** Employer's requested conditions at exam time (employer's own data). */
  employerRequirements: string | null
}

/** Maps a queried examination to the medical-data-free list row. */
export function toFiseListRow(exam: ExaminationForFiseList): FiseListRow {
  return {
    id: exam.id,
    examinationNumber: exam.examinationNumber,
    companyId: exam.workplace.companyId,
    workplaceId: exam.workplace.id,
    // Combined "{workplace} / {site}" label so HR sees the same text the fișă
    // prints (just the name when there is no site).
    lastName: exam.employee.lastName,
    firstName: exam.employee.firstName,
    jobTitle: exam.employee.jobTitle,
    workplaceName: formatWorkplaceLabel(exam.workplace),
    examTypeCode: exam.examinationType.code,
    examTypeName: exam.examinationType.nameRo,
    verdict: exam.verdict,
    examDate: resolveExaminationDate(exam).toISOString(),
    nextDueDate: exam.nextExaminationDueDate ? exam.nextExaminationDueDate.toISOString() : null,
    isRevoked: exam.revokedAt != null,
    revokedAt: exam.revokedAt ? exam.revokedAt.toISOString() : null,
    replacementNumber: exam.supersededBy?.examinationNumber ?? null,
    employerRequirements: exam.employerRequirementsSnapshot ?? null,
  }
}

/** Filename for a downloaded/zipped fișă: <NUME>_<PRENUME>_<nr>_<data>.pdf */
export function fiseFileName(row: {
  lastName: string
  firstName: string
  examinationNumber: string
  examDate: string
}): string {
  const safe = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
  const date = row.examDate.slice(0, 10)
  return `${safe(row.lastName)}_${safe(row.firstName)}_${row.examinationNumber.replace('/', '-')}_${date}.pdf`
}

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashCnp } from '@/lib/crypto/cnp-hash'
import { getOrCreateTenantCnpSalt } from '@/lib/crypto/tenant-salt'
import {
  computeEmployeeStatus,
  type EmployeeStatusKind,
} from '@/components/employees/employee-status'
import { FOLD_FROM, FOLD_TO, normalizeTerm } from './normalize'

/**
 * Global search (⌘K). Tenant-scoped, read-only, grouped. Each group is
 * capped at MAX_PER_GROUP and all groups run in parallel so the whole
 * request stays well under the 300 ms target on ~2000 employees.
 *
 * Diacritics-insensitivity for the employee name / id / job title columns
 * is done with a normalised SQL expression (see ./normalize) rather than
 * the `unaccent` extension, which this database does not have installed.
 */

export const MIN_QUERY_LEN = 2
const MAX_PER_GROUP = 6

export type SearchResultType = 'employee' | 'company' | 'examination' | 'workplace'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  href: string
  /** Employees only — drives the status dot in the result row. */
  statusKind?: EmployeeStatusKind
}

export interface SearchResults {
  employees: SearchResult[]
  companies: SearchResult[]
  examinations: SearchResult[]
  workplaces: SearchResult[]
}

const EMPTY: SearchResults = {
  employees: [],
  companies: [],
  examinations: [],
  workplaces: [],
}

/** SQL fragment: fold a column to a lowercase, diacritics-free form. */
function foldedColumn(col: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`translate(lower(${col}), ${FOLD_FROM}, ${FOLD_TO})`
}

type EmployeeRow = {
  id: string
  first_name: string
  last_name: string
  company_employee_id: string | null
  archived_at: Date | null
}

async function searchEmployees(tenantId: string, q: string): Promise<SearchResult[]> {
  const isCnp = /^\d{13}$/.test(q)

  let rows: EmployeeRow[]
  if (isCnp) {
    // Exact CNP via the tenant-salted hash — never LIKE on a CNP, never
    // return or log the plaintext. Same hash path as app/api/employees.
    let cnpHash: string
    try {
      const salt = await getOrCreateTenantCnpSalt(tenantId)
      cnpHash = hashCnp(q, salt)
    } catch {
      // Encryption key / salt unavailable — degrade to no employee hits
      // rather than failing the whole search.
      return []
    }
    const matches = await prisma.employee.findMany({
      where: { tenantId, cnpHash, deletedAt: null },
      orderBy: [{ archivedAt: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      take: MAX_PER_GROUP,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyEmployeeId: true,
        archivedAt: true,
      },
    })
    rows = matches.map((m) => ({
      id: m.id,
      first_name: m.firstName,
      last_name: m.lastName,
      company_employee_id: m.companyEmployeeId,
      archived_at: m.archivedAt,
    }))
  } else {
    const like = `%${normalizeTerm(q)}%`
    rows = await prisma.$queryRaw<EmployeeRow[]>`
      SELECT id, first_name, last_name, company_employee_id, archived_at
      FROM employees
      WHERE tenant_id = ${tenantId}::uuid
        AND deleted_at IS NULL
        AND (
          ${foldedColumn(Prisma.sql`last_name || ' ' || first_name`)} LIKE ${like}
          OR ${foldedColumn(Prisma.sql`first_name || ' ' || last_name`)} LIKE ${like}
          OR ${foldedColumn(Prisma.sql`coalesce(company_employee_id, '')`)} LIKE ${like}
          OR ${foldedColumn(Prisma.sql`coalesce(job_title, '')`)} LIKE ${like}
        )
      ORDER BY (archived_at IS NOT NULL), last_name, first_name
      LIMIT ${MAX_PER_GROUP}
    `
  }

  if (rows.length === 0) return []

  // Batch the status inputs (earliest open recall + whether any completed
  // exam exists) for the matched employees, so the dot matches the list.
  const ids = rows.map((r) => r.id)
  const [recalls, completed] = await Promise.all([
    prisma.recall.findMany({
      where: {
        tenantId,
        employeeId: { in: ids },
        deletedAt: null,
        status: { in: ['pending', 'scheduled', 'overdue'] },
      },
      orderBy: { dueDate: 'asc' },
      select: { employeeId: true, dueDate: true, status: true },
    }),
    prisma.examination.groupBy({
      by: ['employeeId'],
      where: {
        tenantId,
        employeeId: { in: ids },
        status: 'completed',
        deletedAt: null,
      },
    }),
  ])

  const earliestRecall = new Map<string, { dueDate: Date; status: string }>()
  for (const r of recalls) {
    if (!earliestRecall.has(r.employeeId)) {
      earliestRecall.set(r.employeeId, { dueDate: r.dueDate, status: r.status })
    }
  }
  const hasExam = new Set(completed.map((c) => c.employeeId))

  return rows.map((r) => {
    const recall = earliestRecall.get(r.id) ?? null
    const status = computeEmployeeStatus({
      recall: recall
        ? { dueDate: recall.dueDate.toISOString().slice(0, 10), status: recall.status }
        : null,
      hasExam: hasExam.has(r.id),
    })
    const idLabel = r.company_employee_id ? ` · #${r.company_employee_id}` : ''
    return {
      type: 'employee' as const,
      id: r.id,
      title: `${r.last_name} ${r.first_name}`,
      subtitle: r.archived_at ? `Arhivat${idLabel}` : idLabel.replace(/^ · /, ''),
      href: `/employees/${r.id}`,
      statusKind: status.kind,
    }
  })
}

async function searchCompanies(tenantId: string, q: string): Promise<SearchResult[]> {
  const rows = await prisma.company.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { cui: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
    take: MAX_PER_GROUP,
    select: { id: true, name: true, cui: true },
  })
  return rows.map((c) => ({
    type: 'company' as const,
    id: c.id,
    title: c.name,
    subtitle: c.cui ? `CUI ${c.cui}` : '',
    href: `/companies/${c.id}`,
  }))
}

async function searchExaminations(tenantId: string, q: string): Promise<SearchResult[]> {
  const rows = await prisma.examination.findMany({
    where: {
      tenantId,
      deletedAt: null,
      examinationNumber: { contains: q, mode: 'insensitive' },
    },
    orderBy: [{ examinationYear: 'desc' }, { examinationSequence: 'desc' }],
    take: MAX_PER_GROUP,
    select: {
      id: true,
      examinationNumber: true,
      status: true,
      verdict: true,
      examinationType: { select: { nameRo: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
  })
  return rows.map((e) => {
    const who = `${e.employee.lastName} ${e.employee.firstName}`
    const parts = [who, e.examinationType.nameRo, e.verdict ?? e.status].filter(Boolean)
    return {
      type: 'examination' as const,
      id: e.id,
      title: e.examinationNumber,
      subtitle: parts.join(' · '),
      href: `/examinations/${e.id}`,
    }
  })
}

async function searchWorkplaces(tenantId: string, q: string): Promise<SearchResult[]> {
  const rows = await prisma.workplace.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    orderBy: { name: 'asc' },
    take: MAX_PER_GROUP,
    select: {
      id: true,
      name: true,
      company: { select: { id: true, name: true } },
    },
  })
  return rows.map((w) => ({
    type: 'workplace' as const,
    id: w.id,
    title: w.name,
    subtitle: w.company.name,
    href: `/companies/${w.company.id}`,
  }))
}

export async function runGlobalSearch(tenantId: string, rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim()
  if (q.length < MIN_QUERY_LEN) return EMPTY

  const [employees, companies, examinations, workplaces] = await Promise.all([
    searchEmployees(tenantId, q),
    searchCompanies(tenantId, q),
    searchExaminations(tenantId, q),
    searchWorkplaces(tenantId, q),
  ])

  return { employees, companies, examinations, workplaces }
}

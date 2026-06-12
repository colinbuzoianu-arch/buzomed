import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * Bulk employee import — commit endpoint.
 *
 * Supports two modes:
 *
 * Old mode (companyId provided, no per-row company data):
 *   - companyId is required
 *   - department column → strict match to existing Workplace (fail row if not found)
 *
 * Extended mode (per-row companyName + cui columns present):
 *   - companyId is optional (used as fallback for rows without company data)
 *   - Companies are found-or-created by CUI
 *   - Workplaces are found-or-created by name under the resolved company
 *   - workplace_not_found is non-fatal (employee imported without workplace)
 */

interface ImportRow {
  rowNumber: number
  firstName: string
  lastName: string
  companyEmployeeId: string | null
  email: string | null
  department: string | null
  jobTitle: string | null
  city: string | null
  skipIfDuplicate: boolean
  // Extended columns
  companyName: string | null
  cui: string | null
  companyAddress: string | null
  workplaceName: string | null
}

interface RowOutcome {
  rowNumber: number
  outcome: 'created' | 'skipped' | 'failed'
  reason?: string
  employeeId?: string
  duplicateEmployeeId?: string
  warning?: string
}

const MAX_ROWS_PER_IMPORT = 500

function normalizeCui(raw: string): string {
  return raw.trim().toUpperCase().replace(/^RO\s*/i, '')
}

function isValidCui(raw: string): boolean {
  return /^\d{6,10}$/.test(normalizeCui(raw))
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const body = asObject(raw) ?? {}
  const fallbackCompanyId = typeof body.companyId === 'string' && body.companyId ? body.companyId : null
  const rowsInput = Array.isArray(body.rows) ? body.rows : []

  if (rowsInput.length === 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['rows is empty'] },
      { status: 400 }
    )
  }
  if (rowsInput.length > MAX_ROWS_PER_IMPORT) {
    return NextResponse.json(
      { error: 'too_many_rows', message: `Maximum ${MAX_ROWS_PER_IMPORT} rows per import` },
      { status: 400 }
    )
  }

  // Validate the fallback company if provided
  let fallbackCompany: { id: string; name: string; workplaces: { id: string; name: string; department: string | null }[] } | null = null
  if (fallbackCompanyId) {
    fallbackCompany = await prisma.company.findFirst({
      where: { id: fallbackCompanyId, tenantId: auth.user.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        workplaces: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true, department: true },
        },
      },
    })
    if (!fallbackCompany) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
    }
  }

  // Workplace lookup for the fallback company (old-mode strict matching)
  const workplaceByDept = new Map<string, { id: string; name: string }>()
  const workplaceByName = new Map<string, { id: string; name: string }>()
  for (const w of fallbackCompany?.workplaces ?? []) {
    workplaceByName.set(w.name.toLowerCase(), { id: w.id, name: w.name })
    if (w.department) workplaceByDept.set(w.department.toLowerCase(), { id: w.id, name: w.name })
  }
  function findFallbackWorkplace(dept: string | null): { id: string; name: string } | null {
    if (!dept) return null
    const key = dept.toLowerCase().trim()
    return workplaceByDept.get(key) ?? workplaceByName.get(key) ?? null
  }

  // Normalize and validate input rows
  const rows: ImportRow[] = []
  for (let i = 0; i < rowsInput.length; i++) {
    const r = asObject(rowsInput[i]) ?? {}
    const firstName = typeof r.firstName === 'string' ? r.firstName.trim() : ''
    const lastName = typeof r.lastName === 'string' ? r.lastName.trim() : ''
    if (!firstName || !lastName) continue
    rows.push({
      rowNumber: typeof r.rowNumber === 'number' ? r.rowNumber : i + 2,
      firstName,
      lastName,
      companyEmployeeId: typeof r.companyEmployeeId === 'string' && r.companyEmployeeId.trim() ? r.companyEmployeeId.trim() : null,
      email: typeof r.email === 'string' && r.email.trim() ? r.email.trim().toLowerCase() : null,
      department: typeof r.department === 'string' && r.department.trim() ? r.department.trim() : null,
      jobTitle: typeof r.jobTitle === 'string' && r.jobTitle.trim() ? r.jobTitle.trim() : null,
      city: typeof r.city === 'string' && r.city.trim() ? r.city.trim() : null,
      skipIfDuplicate: r.skipIfDuplicate !== false,
      companyName: typeof r.companyName === 'string' && r.companyName.trim() ? r.companyName.trim() : null,
      cui: typeof r.cui === 'string' && r.cui.trim() ? r.cui.trim() : null,
      companyAddress: typeof r.companyAddress === 'string' && r.companyAddress.trim() ? r.companyAddress.trim() : null,
      workplaceName: typeof r.workplaceName === 'string' && r.workplaceName.trim() ? r.workplaceName.trim() : null,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['No valid rows to import'] },
      { status: 400 }
    )
  }

  // Detect mode: extended if any row carries per-row company data
  const isExtendedMode = rows.some((r) => r.cui || r.companyName)

  // Old-mode guard: if no per-row company data and no fallback company → reject
  if (!isExtendedMode && !fallbackCompanyId) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['companyId is required when file has no company columns'] },
      { status: 400 }
    )
  }

  // Pre-load existing employees for duplicate detection
  const existingEmployees = await prisma.employee.findMany({
    where: { tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const existingByName = new Map<string, string>()
  const existingByEmail = new Map<string, string>()
  for (const e of existingEmployees) {
    existingByName.set(`${e.firstName.toLowerCase()}|${e.lastName.toLowerCase()}`, e.id)
    if (e.email) existingByEmail.set(e.email.toLowerCase(), e.id)
  }

  // Per-import caches for company/workplace resolution
  const companiesCache = new Map<string, string>()      // normalizedCui → companyId
  const companiesByName = new Map<string, string | null>() // lowerName → companyId (null = not found)
  const workplacesCache = new Map<string, string>()     // `${companyId}:${lowerName}` → workplaceId

  let created = 0, skipped = 0, failed = 0
  let companiesCreated = 0, workplacesCreated = 0
  let rowsWithoutCompany = 0, rowsWithoutWorkplace = 0
  let anyRowHadWorkplaceName = false
  const newCompanyList: Array<{ id: string; name: string; cui: string }> = []
  const results: RowOutcome[] = []

  const tenantId = auth.user.tenantId

  for (const row of rows) {
    if (row.workplaceName) anyRowHadWorkplaceName = true
    try {
      // ── 1. Resolve company ────────────────────────────────────────────
      let resolvedCompanyId: string | null = null
      let rowWarning: string | undefined

      if (row.cui && row.companyName) {
        if (!isValidCui(row.cui)) {
          rowWarning = 'invalid_cui'
          resolvedCompanyId = fallbackCompanyId
        } else {
          const normalized = normalizeCui(row.cui)
          if (companiesCache.has(normalized)) {
            resolvedCompanyId = companiesCache.get(normalized)!
          } else {
            const existing = await prisma.company.findFirst({
              where: {
                tenantId,
                deletedAt: null,
                cui: { in: [normalized, `RO${normalized}`] },
              },
              select: { id: true },
            })
            if (existing) {
              companiesCache.set(normalized, existing.id)
              resolvedCompanyId = existing.id
            } else {
              const created = await prisma.company.create({
                data: {
                  tenantId,
                  name: row.companyName,
                  cui: normalized,
                  addressLine1: row.companyAddress ?? null,
                  createdFromImport: true,
                },
                select: { id: true },
              })
              companiesCache.set(normalized, created.id)
              resolvedCompanyId = created.id
              newCompanyList.push({ id: created.id, name: row.companyName, cui: normalized })
              companiesCreated++
            }
          }
        }
      } else if (row.companyName) {
        // companyName present but no CUI — try name-based lookup before falling back to UI selection
        const coNameKey = row.companyName.toLowerCase()
        if (companiesByName.has(coNameKey)) {
          resolvedCompanyId = companiesByName.get(coNameKey) ?? fallbackCompanyId
        } else {
          const byName = await prisma.company.findFirst({
            where: { tenantId, deletedAt: null, name: { equals: row.companyName, mode: 'insensitive' } },
            select: { id: true },
          })
          companiesByName.set(coNameKey, byName?.id ?? null)
          resolvedCompanyId = byName?.id ?? fallbackCompanyId
        }
        if (!resolvedCompanyId) rowWarning = 'incomplete_company_columns'
      } else if (row.cui) {
        // CUI present but no company name
        rowWarning = 'incomplete_company_columns'
        resolvedCompanyId = fallbackCompanyId
      } else {
        resolvedCompanyId = fallbackCompanyId
      }

      if (!resolvedCompanyId) rowsWithoutCompany++

      // ── 2. Resolve workplace ──────────────────────────────────────────
      let resolvedWorkplaceId: string | null = null

      if (row.workplaceName && resolvedCompanyId) {
        const cacheKey = `${resolvedCompanyId}:${row.workplaceName.toLowerCase()}`
        if (workplacesCache.has(cacheKey)) {
          resolvedWorkplaceId = workplacesCache.get(cacheKey)!
        } else {
          const existingWp = await prisma.workplace.findFirst({
            where: {
              companyId: resolvedCompanyId,
              tenantId,
              deletedAt: null,
              name: { equals: row.workplaceName, mode: 'insensitive' },
            },
            select: { id: true },
          })
          if (existingWp) {
            workplacesCache.set(cacheKey, existingWp.id)
            resolvedWorkplaceId = existingWp.id
          } else {
            const newWp = await prisma.workplace.create({
              data: { companyId: resolvedCompanyId, tenantId, name: row.workplaceName, isActive: true },
              select: { id: true },
            })
            workplacesCache.set(cacheKey, newWp.id)
            resolvedWorkplaceId = newWp.id
            workplacesCreated++
          }
        }
      } else if (row.department && resolvedCompanyId) {
        const wp = findFallbackWorkplace(row.department)
        resolvedWorkplaceId = wp?.id ?? null
        if (!resolvedWorkplaceId) {
          if (!isExtendedMode) {
            // Old mode: strict — fail the row
            results.push({ rowNumber: row.rowNumber, outcome: 'failed', reason: 'workplace_not_found' })
            failed++
            continue
          }
          rowsWithoutWorkplace++
        }
      } else if (row.workplaceName && !resolvedCompanyId) {
        rowsWithoutWorkplace++
      }

      // ── 3. Duplicate detection ────────────────────────────────────────
      const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
      const dupByName = existingByName.get(nameKey)
      const dupByEmail = row.email ? existingByEmail.get(row.email) : undefined
      const duplicate = dupByName ?? dupByEmail
      if (duplicate && row.skipIfDuplicate) {
        results.push({ rowNumber: row.rowNumber, outcome: 'skipped', reason: 'duplicate_employee', duplicateEmployeeId: duplicate })
        skipped++
        continue
      }

      // ── 4. Create employee + workplace assignment ─────────────────────
      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            tenantId,
            createdByUserId: auth.user!.id,
            firstName: row.firstName,
            lastName: row.lastName,
            idDocumentType: 'other',
            idDocumentNumber: null,
            companyId: resolvedCompanyId,
            companyEmployeeId: row.companyEmployeeId,
            jobTitle: row.jobTitle,
            city: row.city,
            email: row.email,
            nationality: 'RO',
            isActive: true,
          },
          select: { id: true },
        })
        if (resolvedWorkplaceId) {
          await tx.employeeWorkplaceAssignment.create({
            data: {
              tenantId,
              employeeId: employee.id,
              workplaceId: resolvedWorkplaceId,
              startDate: new Date(),
              isCurrent: true,
              reasonForChange: 'hired',
            },
          })
        }
        return employee
      })

      existingByName.set(nameKey, result.id)
      if (row.email) existingByEmail.set(row.email, result.id)

      results.push({ rowNumber: row.rowNumber, outcome: 'created', employeeId: result.id, warning: rowWarning })
      created++
    } catch (err) {
      console.error('[employees.import] row failed', { rowNumber: row.rowNumber, error: (err as Error).message })
      void logSystemError({
        tenantId,
        route: '/api/employees/import/commit',
        method: 'POST',
        error: err,
        context: { rowNumber: row.rowNumber, rowCount: rows.length },
      })
      const code = (err as { code?: string }).code
      results.push({
        rowNumber: row.rowNumber,
        outcome: 'failed',
        reason: code === 'P2002' ? 'unique_constraint' : 'unknown_error',
      })
      failed++
    }
  }

  // Compute anomaly flags before persisting the job audit record
  const flags: string[] = []
  if (rowsWithoutWorkplace > 0 && anyRowHadWorkplaceName)
    flags.push('workplace_data_present_but_unassigned')
  if (created === 0 && rows.length > 0)
    flags.push('zero_rows_created')
  if (failed > rows.length * 0.5)
    flags.push('high_failure_rate')
  if (companiesCreated > 0 && fallbackCompanyId)
    flags.push('unexpected_company_creation')

  void prisma.importJob.create({
    data: {
      tenantId,
      initiatedByUserId: auth.user.id,
      fallbackCompanyId,
      totalRows: rows.length,
      created,
      skipped,
      failed,
      companiesCreated,
      workplacesCreated,
      rowsWithoutCompany,
      rowsWithoutWorkplace,
      flags: flags.length > 0 ? flags : undefined,
    },
  }).catch((err) => console.error('[import] Failed to write ImportJob:', err))

  return NextResponse.json({
    summary: { total: rows.length, created, skipped, failed, companiesCreated, workplacesCreated, rowsWithoutCompany, rowsWithoutWorkplace },
    results,
    company: fallbackCompany ? { id: fallbackCompany.id, name: fallbackCompany.name } : null,
    companiesCreated: newCompanyList,
  })
}

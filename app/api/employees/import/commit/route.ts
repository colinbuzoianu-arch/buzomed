import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'

/**
 * Bulk employee import — commit endpoint.
 *
 * Workflow:
 *   1. Client parses CSV/XLSX in browser (lib/employees/import-parser.ts)
 *   2. User reviews the preview, fixes errors locally if any
 *   3. Client POSTs the validated rows here to commit
 *   4. Server validates against the DB (company exists, workplaces
 *      match, no duplicate employees on (firstName + lastName) within
 *      tenant), then creates Employee + WorkplaceAssignment in one
 *      transaction per row
 *
 * Per-row failures don't abort the whole import — we return a
 * report indicating which rows succeeded and which failed.
 *
 * Input shape:
 *   {
 *     companyId: string,
 *     rows: Array<{
 *       firstName: string,
 *       lastName: string,
 *       companyEmployeeId: string | null,
 *       email: string | null,
 *       department: string | null,
 *     }>
 *   }
 *
 * Output shape:
 *   {
 *     summary: { total, created, skipped, failed },
 *     results: Array<{
 *       rowNumber: number,
 *       outcome: 'created' | 'skipped' | 'failed',
 *       reason?: string,
 *       employeeId?: string,
 *     }>
 *   }
 *
 * Notes on what is NOT done here:
 *   - CNP encryption: bulk import does NOT accept CNPs (cabinets get
 *     these at the in-person exam, not from HR exports). Employees
 *     are created with idDocumentType='other' and idDocumentNumber=null.
 *   - Workplace auto-creation: if the row's department doesn't match
 *     an existing Workplace at the chosen company, the row is REJECTED,
 *     not silently created. Workplaces drive risk profile + exam
 *     intervals; auto-creating them would hide important config decisions.
 *   - Duplicate detection: an existing employee matches if
 *     (firstName.toLowerCase + lastName.toLowerCase) is the same. Email
 *     match is also reported as a soft duplicate. The caller can choose
 *     to skip these rows.
 */

interface ImportRow {
  rowNumber: number
  firstName: string
  lastName: string
  companyEmployeeId: string | null
  email: string | null
  department: string | null
  skipIfDuplicate: boolean
}

interface RowOutcome {
  rowNumber: number
  outcome: 'created' | 'skipped' | 'failed'
  reason?: string
  employeeId?: string
  duplicateEmployeeId?: string
}

const MAX_ROWS_PER_IMPORT = 500

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const body = asObject(raw) ?? {}
  const companyId = typeof body.companyId === 'string' ? body.companyId : null
  const rowsInput = Array.isArray(body.rows) ? body.rows : []

  if (!companyId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['companyId is required'],
      },
      { status: 400 }
    )
  }
  if (rowsInput.length === 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['rows is empty'] },
      { status: 400 }
    )
  }
  if (rowsInput.length > MAX_ROWS_PER_IMPORT) {
    return NextResponse.json(
      {
        error: 'too_many_rows',
        message: `Maximum ${MAX_ROWS_PER_IMPORT} rows per import`,
      },
      { status: 400 }
    )
  }

  // Validate the company exists in this tenant.
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      workplaces: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, department: true },
      },
    },
  })
  if (!company) {
    return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
  }

  // Build a lookup table for workplace matching. We match by:
  //   1. exact department field match (case-insensitive)
  //   2. exact name field match (case-insensitive)
  // Cabinets sometimes use "department" loosely — the row's "department"
  // value may correspond to either the Workplace name OR the Workplace.department
  // sub-field. We try both.
  const workplaceByDept = new Map<string, { id: string; name: string }>()
  const workplaceByName = new Map<string, { id: string; name: string }>()
  for (const w of company.workplaces) {
    workplaceByName.set(w.name.toLowerCase(), { id: w.id, name: w.name })
    if (w.department) {
      workplaceByDept.set(w.department.toLowerCase(), {
        id: w.id,
        name: w.name,
      })
    }
  }
  function findWorkplace(dept: string | null): { id: string; name: string } | null {
    if (!dept) return null
    const key = dept.toLowerCase().trim()
    return workplaceByDept.get(key) ?? workplaceByName.get(key) ?? null
  }

  // Normalize and validate the input rows.
  const rows: ImportRow[] = []
  for (let i = 0; i < rowsInput.length; i++) {
    const r = asObject(rowsInput[i]) ?? {}
    const firstName = typeof r.firstName === 'string' ? r.firstName.trim() : ''
    const lastName = typeof r.lastName === 'string' ? r.lastName.trim() : ''
    if (!firstName || !lastName) {
      // Defensive — the client should have caught this. Still tolerate it.
      continue
    }
    rows.push({
      rowNumber:
        typeof r.rowNumber === 'number' ? r.rowNumber : i + 2,
      firstName,
      lastName,
      companyEmployeeId:
        typeof r.companyEmployeeId === 'string' && r.companyEmployeeId.trim()
          ? r.companyEmployeeId.trim()
          : null,
      email:
        typeof r.email === 'string' && r.email.trim()
          ? r.email.trim().toLowerCase()
          : null,
      department:
        typeof r.department === 'string' && r.department.trim()
          ? r.department.trim()
          : null,
      skipIfDuplicate: r.skipIfDuplicate !== false, // default true
    })
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['No valid rows to import'],
      },
      { status: 400 }
    )
  }

  // Pre-load existing employees in this tenant for duplicate detection.
  // We compare by lowercased first+last name AND by email. This is a
  // small additional read but avoids N+1 inside the per-row loop.
  const existingEmployees = await prisma.employee.findMany({
    where: { tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  })
  const existingByName = new Map<string, string>()
  const existingByEmail = new Map<string, string>()
  for (const e of existingEmployees) {
    const nameKey = `${e.firstName.toLowerCase()}|${e.lastName.toLowerCase()}`
    existingByName.set(nameKey, e.id)
    if (e.email) {
      existingByEmail.set(e.email.toLowerCase(), e.id)
    }
  }

  // Process row by row. Each row is its own short transaction so a
  // mid-batch failure doesn't roll back successful predecessors.
  const results: RowOutcome[] = []
  let created = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      // Duplicate detection
      const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
      const dupByName = existingByName.get(nameKey)
      const dupByEmail = row.email
        ? existingByEmail.get(row.email)
        : undefined
      const duplicate = dupByName ?? dupByEmail
      if (duplicate) {
        if (row.skipIfDuplicate) {
          results.push({
            rowNumber: row.rowNumber,
            outcome: 'skipped',
            reason: 'duplicate_employee',
            duplicateEmployeeId: duplicate,
          })
          skipped++
          continue
        }
        // Caller asked to import-anyway; fall through to create.
      }

      // Workplace lookup
      const workplace = findWorkplace(row.department)
      if (row.department && !workplace) {
        results.push({
          rowNumber: row.rowNumber,
          outcome: 'failed',
          reason: 'workplace_not_found',
        })
        failed++
        continue
      }

      // Create employee + optional workplace assignment
      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            tenantId: auth.user!.tenantId!,
            createdByUserId: auth.user!.id,
            firstName: row.firstName,
            lastName: row.lastName,
            // No CNP from bulk import — captured later at first exam
            idDocumentType: 'other',
            idDocumentNumber: null,
            companyEmployeeId: row.companyEmployeeId,
            email: row.email,
            nationality: 'RO',
            isActive: true,
          },
          select: { id: true },
        })
        if (workplace) {
          await tx.employeeWorkplaceAssignment.create({
            data: {
              tenantId: auth.user!.tenantId!,
              employeeId: employee.id,
              workplaceId: workplace.id,
              startDate: new Date(),
              isCurrent: true,
              reasonForChange: 'hired',
            },
          })
        }
        return employee
      })

      // Update the lookup tables so subsequent rows in the same import
      // also detect this as a duplicate.
      existingByName.set(nameKey, result.id)
      if (row.email) existingByEmail.set(row.email, result.id)

      results.push({
        rowNumber: row.rowNumber,
        outcome: 'created',
        employeeId: result.id,
      })
      created++
    } catch (err) {
      console.error('[employees.import] row failed', {
        rowNumber: row.rowNumber,
        error: (err as Error).message,
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

  return NextResponse.json({
    summary: { total: rows.length, created, skipped, failed },
    results,
    company: { id: company.id, name: company.name },
  })
}

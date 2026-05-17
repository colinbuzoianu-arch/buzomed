import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'

/**
 * Roster diff endpoint.
 *
 * Given a companyId and a list of rows from the import file, compares
 * against the company's current active employee roster and returns a
 * categorized diff:
 *
 *   - new      : in the file, no matching employee currently at this company
 *   - leaving  : currently at this company, not matched by any file row
 *   - moved    : matched in both, but their file department maps to a
 *                different workplace than the one currently assigned
 *   - unchanged: matched, same workplace (or neither has a workplace)
 *
 * Matching order:
 *   1. companyEmployeeId (most reliable)
 *   2. normalized firstName + lastName
 *   3. email
 *
 * The "leaving" category is informational only — the caller should show
 * a disclaimer that this list may simply reflect a partial roster upload
 * rather than actual departures. The commit route does NOT archive them.
 */

interface InputRow {
  rowNumber: number
  firstName: string | null
  lastName: string | null
  email: string | null
  companyEmployeeId: string | null
  department: string | null
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
  const companyId = typeof body.companyId === 'string' ? body.companyId : null
  const rowsInput = Array.isArray(body.rows) ? body.rows : []

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      workplaces: {
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, department: true },
      },
    },
  })
  if (!company) {
    return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
  }

  // Build workplace name resolver (same algorithm as commit route)
  const workplaceByDept = new Map<string, string>()
  const workplaceByName = new Map<string, string>()
  for (const w of company.workplaces) {
    workplaceByName.set(w.name.toLowerCase(), w.name)
    if (w.department) workplaceByDept.set(w.department.toLowerCase(), w.name)
  }
  function resolveWorkplaceName(dept: string | null): string | null {
    if (!dept) return null
    const key = dept.toLowerCase().trim()
    return workplaceByDept.get(key) ?? workplaceByName.get(key) ?? null
  }

  // Load current active employees at this company via their current assignments
  const currentAssignments = await prisma.employeeWorkplaceAssignment.findMany({
    where: {
      tenantId: auth.user.tenantId,
      isCurrent: true,
      workplace: { companyId, deletedAt: null },
      employee: { deletedAt: null, isActive: true },
    },
    select: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          companyEmployeeId: true,
        },
      },
      workplace: { select: { name: true } },
    },
  })

  type Assignment = (typeof currentAssignments)[0]

  const currentByEmpId = new Map<string, Assignment>()
  const currentByName = new Map<string, Assignment>()
  const currentByEmail = new Map<string, Assignment>()
  for (const a of currentAssignments) {
    if (a.employee.companyEmployeeId) {
      currentByEmpId.set(a.employee.companyEmployeeId, a)
    }
    const nameKey = `${a.employee.firstName.toLowerCase()}|${a.employee.lastName.toLowerCase()}`
    currentByName.set(nameKey, a)
    if (a.employee.email) {
      currentByEmail.set(a.employee.email.toLowerCase(), a)
    }
  }

  // Parse input rows
  const rows: InputRow[] = rowsInput.map((r: unknown, i: number) => {
    const obj = asObject(r) ?? {}
    return {
      rowNumber: typeof obj.rowNumber === 'number' ? obj.rowNumber : i + 2,
      firstName:
        typeof obj.firstName === 'string' ? obj.firstName.trim() || null : null,
      lastName:
        typeof obj.lastName === 'string' ? obj.lastName.trim() || null : null,
      email:
        typeof obj.email === 'string'
          ? obj.email.trim().toLowerCase() || null
          : null,
      companyEmployeeId:
        typeof obj.companyEmployeeId === 'string'
          ? obj.companyEmployeeId.trim() || null
          : null,
      department:
        typeof obj.department === 'string' ? obj.department.trim() || null : null,
    }
  })

  // Categorize each file row
  const matchedIds = new Set<string>()
  const newEmployees: Array<{
    rowNumber: number
    firstName: string
    lastName: string
    toWorkplace: string | null
  }> = []
  const movedEmployees: Array<{
    rowNumber: number
    firstName: string
    lastName: string
    fromWorkplace: string
    toWorkplace: string
  }> = []
  let unchanged = 0

  for (const row of rows) {
    if (!row.firstName || !row.lastName) continue

    let match: Assignment | null = null
    if (row.companyEmployeeId) {
      match = currentByEmpId.get(row.companyEmployeeId) ?? null
    }
    if (!match) {
      const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
      match = currentByName.get(nameKey) ?? null
    }
    if (!match && row.email) {
      match = currentByEmail.get(row.email) ?? null
    }

    if (!match) {
      newEmployees.push({
        rowNumber: row.rowNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        toWorkplace: resolveWorkplaceName(row.department),
      })
    } else {
      matchedIds.add(match.employee.id)
      const currentWp = match.workplace.name
      const fileWp = resolveWorkplaceName(row.department)
      if (fileWp && fileWp !== currentWp) {
        movedEmployees.push({
          rowNumber: row.rowNumber,
          firstName: match.employee.firstName,
          lastName: match.employee.lastName,
          fromWorkplace: currentWp,
          toWorkplace: fileWp,
        })
      } else {
        unchanged++
      }
    }
  }

  const leavingEmployees = currentAssignments
    .filter((a) => !matchedIds.has(a.employee.id))
    .map((a) => ({
      id: a.employee.id,
      firstName: a.employee.firstName,
      lastName: a.employee.lastName,
      workplace: a.workplace.name,
    }))

  return NextResponse.json({
    currentCount: currentAssignments.length,
    new: newEmployees,
    leaving: leavingEmployees,
    moved: movedEmployees,
    unchanged,
  })
}

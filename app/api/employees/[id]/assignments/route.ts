import { NextRequest, NextResponse } from 'next/server'
import type { WorkAssignmentReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject, optionalString } from '@/lib/validation'

/**
 * Employee workplace assignments.
 *
 *   GET  /api/employees/[id]/assignments       — list all (current + history)
 *   POST /api/employees/[id]/assignments       — start new assignment
 *
 * Per design (Q2 = single active assignment), POSTing a new assignment
 * while one is already open auto-ends the existing one. The handler is
 * intentionally one entry point for both "first assignment" and
 * "reassignment" — clients don't need to coordinate two API calls.
 *
 * Note on tenant scoping: the workplace targeted by the new assignment
 * must be in the same tenant as the employee. We enforce this server-
 * side rather than trusting the request.
 */

const ASSIGNMENT_REASONS: WorkAssignmentReason[] = [
  'hired',
  'promoted',
  'transferred',
  'role_change',
  'department_change',
  'other',
]

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadEmployeeForActor(employeeId: string, tenantId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      archivedAt: true,
      lastName: true,
      firstName: true,
    },
  })
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
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

  const { id: employeeId } = await ctx.params
  const employee = await loadEmployeeForActor(employeeId, auth.user.tenantId)
  if (!employee) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const assignments = await prisma.employeeWorkplaceAssignment.findMany({
    where: {
      employeeId,
      tenantId: auth.user.tenantId,
    },
    orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    include: {
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          companyId: true,
          company: {
            select: { id: true, name: true },
          },
        },
      },
    },
  })

  return NextResponse.json({ assignments })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
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

  const { id: employeeId } = await ctx.params
  const employee = await loadEmployeeForActor(employeeId, auth.user.tenantId)
  if (!employee) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (employee.archivedAt) {
    return NextResponse.json(
      {
        error: 'employee_archived',
        message: 'Cannot start an assignment for an archived employee.',
      },
      { status: 409 }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400 }
    )
  }

  const issues: string[] = []

  // Workplace ID is required.
  if (typeof body.workplaceId !== 'string' || body.workplaceId.trim() === '') {
    issues.push('workplaceId is required')
  }

  // Start date defaults to today if not given. Accept ISO date string.
  let startDate: Date
  if (body.startDate === undefined || body.startDate === null || body.startDate === '') {
    startDate = new Date()
    // Normalize to UTC midnight to match @db.Date storage
    startDate = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
    )
  } else if (typeof body.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
    issues.push('startDate must be in YYYY-MM-DD format')
    startDate = new Date() // placeholder, won't be used
  } else {
    startDate = new Date(`${body.startDate}T00:00:00Z`)
    if (isNaN(startDate.getTime())) {
      issues.push('startDate is not a valid date')
    }
  }

  let reason: WorkAssignmentReason | undefined
  if (body.reasonForChange !== undefined && body.reasonForChange !== null) {
    if (
      typeof body.reasonForChange !== 'string' ||
      !ASSIGNMENT_REASONS.includes(body.reasonForChange as WorkAssignmentReason)
    ) {
      issues.push(
        `reasonForChange must be one of: ${ASSIGNMENT_REASONS.join(', ')}`
      )
    } else {
      reason = body.reasonForChange as WorkAssignmentReason
    }
  }

  const notes = optionalString('notes', body.notes, issues, { maxLength: 1000 })

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  // Verify workplace exists, is in the same tenant, is active, AND belongs
  // to the same company as the employee. Cross-company assignments are not
  // allowed — a worker belongs to one employer.
  const [workplace, employee2] = await Promise.all([
    prisma.workplace.findFirst({
      where: {
        id: body.workplaceId as string,
        tenantId: auth.user.tenantId,
        deletedAt: null,
      },
      select: { id: true, isActive: true, companyId: true },
    }),
    // Re-fetch employee with companyId (loadEmployeeForActor doesn't select it)
    prisma.employee.findFirst({
      where: { id: employeeId, tenantId: auth.user.tenantId },
      select: { companyId: true },
    }),
  ])

  if (!workplace) {
    return NextResponse.json(
      { error: 'workplace_not_found' },
      { status: 404 }
    )
  }
  if (!workplace.isActive) {
    return NextResponse.json(
      {
        error: 'workplace_inactive',
        message: 'Cannot assign an employee to an inactive workplace.',
      },
      { status: 409 }
    )
  }
  // Cross-company guard — only enforce when employee has a company set
  if (employee2?.companyId && workplace.companyId !== employee2.companyId) {
    return NextResponse.json(
      {
        error: 'company_mismatch',
        message: 'Workplace belongs to a different company than the employee.',
      },
      { status: 409 }
    )
  }

  // Find any currently-open assignment so we can close it.
  const openAssignment = await prisma.employeeWorkplaceAssignment.findFirst({
    where: {
      employeeId,
      tenantId: auth.user.tenantId,
      isCurrent: true,
    },
  })

  // If they're trying to "reassign" to the SAME workplace, that's a no-op.
  if (openAssignment && openAssignment.workplaceId === workplace.id) {
    return NextResponse.json(
      {
        error: 'already_assigned',
        message: 'Employee is already currently assigned to this workplace.',
      },
      { status: 409 }
    )
  }

  // Atomic: close the open one, create the new one. If we did these as
  // two separate writes the system could observe "two current assignments"
  // mid-flight, which violates the design.
  const [, newAssignment] = await prisma.$transaction([
    // No-op when openAssignment is null because updateMany with no matches
    // is fine, but we use a guarded conditional to keep the txn small.
    openAssignment
      ? prisma.employeeWorkplaceAssignment.update({
          where: { id: openAssignment.id },
          data: {
            isCurrent: false,
            endDate: startDate, // end the day the new one begins
          },
        })
      : prisma.employeeWorkplaceAssignment.findFirst({
          where: { id: '00000000-0000-0000-0000-000000000000' },
        }), // no-op placeholder; never matches
    prisma.employeeWorkplaceAssignment.create({
      data: {
        tenantId: auth.user.tenantId,
        employeeId,
        workplaceId: workplace.id,
        startDate,
        isCurrent: true,
        reasonForChange: reason ?? (openAssignment ? 'transferred' : 'hired'),
        notes,
      },
      include: {
        workplace: {
          select: {
            id: true,
            name: true,
            department: true,
            companyId: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ])

  return NextResponse.json({ assignment: newAssignment }, { status: 201 })
}

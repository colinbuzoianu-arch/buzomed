import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import type { WorkAssignmentReason } from '@prisma/client'

const VALID_REASONS: WorkAssignmentReason[] = [
  'hired', 'promoted', 'transferred', 'role_change', 'department_change', 'other',
]

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const body = asObject(raw) ?? {}
  const employeeIds: string[] = Array.isArray(body.employeeIds)
    ? (body.employeeIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const workplaceId = typeof body.workplaceId === 'string' ? body.workplaceId.trim() : null
  const reasonRaw = typeof body.reason === 'string' ? body.reason : 'hired'
  const reason: WorkAssignmentReason = VALID_REASONS.includes(reasonRaw as WorkAssignmentReason)
    ? (reasonRaw as WorkAssignmentReason)
    : 'hired'

  if (employeeIds.length === 0)
    return NextResponse.json({ error: 'validation_failed', issues: ['employeeIds is empty'] }, { status: 400 })
  if (!workplaceId)
    return NextResponse.json({ error: 'validation_failed', issues: ['workplaceId is required'] }, { status: 400 })

  const workplace = await prisma.workplace.findFirst({
    where: { id: workplaceId, tenantId: auth.user.tenantId, deletedAt: null, isActive: true },
    select: { id: true },
  })
  if (!workplace)
    return NextResponse.json({ error: 'workplace_not_found' }, { status: 404 })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const results: Array<{ employeeId: string; outcome: 'assigned' | 'failed'; reason?: string }> = []
  let success = 0
  let failed = 0

  for (const employeeId of employeeIds) {
    try {
      await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findFirst({
          where: {
            id: employeeId,
            tenantId: auth.user!.tenantId!,
            isActive: true,
            deletedAt: null,
            archivedAt: null,
          },
          select: { id: true },
        })
        if (!employee) throw new Error('employee_not_found')

        // End all current assignments
        await tx.employeeWorkplaceAssignment.updateMany({
          where: { employeeId, tenantId: auth.user!.tenantId!, isCurrent: true },
          data: { isCurrent: false, endDate: today },
        })

        // Create new current assignment
        await tx.employeeWorkplaceAssignment.create({
          data: {
            tenantId: auth.user!.tenantId!,
            employeeId,
            workplaceId: workplace.id,
            startDate: today,
            isCurrent: true,
            reasonForChange: reason,
          },
        })
      })
      results.push({ employeeId, outcome: 'assigned' })
      success++
    } catch (err) {
      const msg = (err as Error).message
      results.push({
        employeeId,
        outcome: 'failed',
        reason: msg === 'employee_not_found' ? 'employee_not_found' : 'unexpected_error',
      })
      failed++
    }
  }

  return NextResponse.json({ summary: { total: employeeIds.length, success, failed }, results })
}

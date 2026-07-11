import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import type { WorkAssignmentReason } from '@prisma/client'
import { deliverEmployeeUpdatedWebhook } from '@/lib/webhooks/employee-webhook'
import { logSystemError } from '@/lib/system-log/error-log'
import { runInBatches } from '@/lib/batch-parallel'

const VALID_REASONS: WorkAssignmentReason[] = [
  'hired', 'promoted', 'transferred', 'role_change', 'department_change', 'other',
]

// Matches bulk-schedule's cap — the most similar operation in shape
// (per-item transaction driven by an admin-selected UI list).
const MAX_BATCH = 200
const ASSIGN_CONCURRENCY = 10

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
  const rawEmployeeIds: string[] = Array.isArray(body.employeeIds)
    ? (body.employeeIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  // Dedupe: a duplicate id would otherwise let two concurrent transactions
  // race on the same employee's assignment rows (no DB constraint prevents
  // two simultaneous isCurrent:true rows for one employee).
  const employeeIds = [...new Set(rawEmployeeIds)]
  const workplaceId = typeof body.workplaceId === 'string' ? body.workplaceId.trim() : null
  const reasonRaw = typeof body.reason === 'string' ? body.reason : 'hired'
  const reason: WorkAssignmentReason = VALID_REASONS.includes(reasonRaw as WorkAssignmentReason)
    ? (reasonRaw as WorkAssignmentReason)
    : 'hired'

  if (employeeIds.length === 0)
    return NextResponse.json({ error: 'validation_failed', issues: ['employeeIds is empty'] }, { status: 400 })
  if (employeeIds.length > MAX_BATCH)
    return NextResponse.json(
      { error: 'validation_failed', issues: [`employeeIds exceeds the ${MAX_BATCH}-item limit`] },
      { status: 400 }
    )
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
  const tenantId = auth.user.tenantId

  // Each employeeId (already deduped above) touches fully disjoint
  // EmployeeWorkplaceAssignment rows — safe to fan out concurrently.
  const outcomes = await runInBatches(employeeIds, ASSIGN_CONCURRENCY, (employeeId) =>
    assignOneEmployee({ employeeId, tenantId, workplaceId: workplace.id, reason, today })
  )

  const results: Array<{ employeeId: string; outcome: 'assigned' | 'failed'; reason?: string }> = []
  let success = 0
  let failed = 0
  for (const outcome of outcomes) {
    // assignOneEmployee never throws — it always resolves to a result object —
    // so 'rejected' here would only mean a bug in that function itself.
    const result = outcome.status === 'fulfilled'
      ? outcome.value
      : { employeeId: 'unknown', outcome: 'failed' as const, reason: 'unexpected_error' }
    results.push(result)
    if (result.outcome === 'assigned') success++
    else failed++
  }

  return NextResponse.json({ summary: { total: employeeIds.length, success, failed }, results })
}

async function assignOneEmployee(params: {
  employeeId: string
  tenantId: string
  workplaceId: string
  reason: WorkAssignmentReason
  today: Date
}): Promise<{ employeeId: string; outcome: 'assigned' | 'failed'; reason?: string }> {
  const { employeeId, tenantId, workplaceId, reason, today } = params
  try {
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId, isActive: true, deletedAt: null, archivedAt: null },
        select: { id: true },
      })
      if (!employee) throw new Error('employee_not_found')

      // End all current assignments
      await tx.employeeWorkplaceAssignment.updateMany({
        where: { employeeId, tenantId, isCurrent: true },
        data: { isCurrent: false, endDate: today },
      })

      // Create new current assignment
      await tx.employeeWorkplaceAssignment.create({
        data: {
          tenantId,
          employeeId,
          workplaceId,
          startDate: today,
          isCurrent: true,
          reasonForChange: reason,
        },
      })
    })
    void deliverEmployeeUpdatedWebhook(employeeId, tenantId)
    return { employeeId, outcome: 'assigned' }
  } catch (err) {
    const msg = (err as Error).message
    if (msg !== 'employee_not_found') {
      void logSystemError({
        tenantId,
        route: '/api/employees/bulk-assign-workplace',
        method: 'POST',
        error: err,
        context: { employeeId },
      })
    }
    return {
      employeeId,
      outcome: 'failed',
      reason: msg === 'employee_not_found' ? 'employee_not_found' : 'unexpected_error',
    }
  }
}

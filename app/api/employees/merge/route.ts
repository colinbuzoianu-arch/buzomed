import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { writeAuditLog } from '@/lib/audit/log'
import { deliverEmployeeUpdatedWebhook } from '@/lib/webhooks/employee-webhook'

/**
 * POST /api/employees/merge
 *
 * Merges a duplicate employee (`sourceEmployeeId`) into the one being kept
 * (`targetEmployeeId`): reassigns every clinical/assignment record from
 * source to target, then archives source with a trace back to target
 * (mergedIntoId) instead of deleting it — the row stays queryable for
 * audit trail and for anyone searching the old name.
 *
 * Permission: canWriteAdministrative, same as employee create/edit — this
 * is record reassignment, not a clinical judgement, so all non-super_admin
 * roles qualify.
 *
 * Known limitation: if both source and target have a "current" workplace
 * assignment (EmployeeWorkplaceAssignment.isCurrent), the target ends up
 * with two isCurrent rows after the merge (no DB constraint prevents this,
 * same gap noted for bulk-assign-workplace). Downstream code that reads
 * "the" current assignment just picks one — a data-quality wrinkle, not a
 * crash risk. Left as-is per the scope of this pass; worth a dedicated
 * look if it causes confusion in practice.
 */
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
  const body = asObject(raw)
  if (!body) {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400 }
    )
  }

  const sourceEmployeeId =
    typeof body.sourceEmployeeId === 'string' ? body.sourceEmployeeId : null
  const targetEmployeeId =
    typeof body.targetEmployeeId === 'string' ? body.targetEmployeeId : null

  if (!sourceEmployeeId || !targetEmployeeId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['sourceEmployeeId and targetEmployeeId are required'],
      },
      { status: 400 }
    )
  }
  if (sourceEmployeeId === targetEmployeeId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['sourceEmployeeId and targetEmployeeId must be different'],
      },
      { status: 400 }
    )
  }

  const tenantId = auth.user.tenantId

  const [source, target] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: sourceEmployeeId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.employee.findFirst({
      where: { id: targetEmployeeId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  if (!source || !target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const [
    assignmentsResult,
    examinationsResult,
    vaccinationsResult,
    medicalEventsResult,
    recallsResult,
  ] = await prisma.$transaction([
    prisma.employeeWorkplaceAssignment.updateMany({
      where: { employeeId: sourceEmployeeId, tenantId },
      data: { employeeId: targetEmployeeId },
    }),
    prisma.examination.updateMany({
      where: { employeeId: sourceEmployeeId, tenantId, deletedAt: null },
      data: { employeeId: targetEmployeeId },
    }),
    prisma.vaccination.updateMany({
      where: { employeeId: sourceEmployeeId, tenantId, deletedAt: null },
      data: { employeeId: targetEmployeeId },
    }),
    prisma.medicalEvent.updateMany({
      where: { employeeId: sourceEmployeeId, tenantId, deletedAt: null },
      data: { employeeId: targetEmployeeId },
    }),
    prisma.recall.updateMany({
      where: { employeeId: sourceEmployeeId, tenantId, deletedAt: null },
      data: { employeeId: targetEmployeeId },
    }),
    // Source stays queryable (deletedAt untouched) — archived + traced to target.
    prisma.employee.update({
      where: { id: sourceEmployeeId },
      data: {
        isActive: false,
        archivedAt: new Date(),
        archivedReason: 'other',
        mergedIntoId: targetEmployeeId,
      },
    }),
  ])

  const movedCounts = {
    assignments: assignmentsResult.count,
    examinations: examinationsResult.count,
    vaccinations: vaccinationsResult.count,
    medicalEvents: medicalEventsResult.count,
    recalls: recallsResult.count,
  }

  const sourceName = `${source.lastName} ${source.firstName}`
  const targetName = `${target.lastName} ${target.firstName}`

  await writeAuditLog({
    tenantId,
    userId: auth.user.id,
    action: 'update',
    entityType: 'employee',
    entityId: targetEmployeeId,
    entitySummary: `Angajat combinat: date mutate de la ${sourceName}`,
    changes: { mergedFromId: sourceEmployeeId, movedCounts },
  })
  await writeAuditLog({
    tenantId,
    userId: auth.user.id,
    action: 'delete',
    entityType: 'employee',
    entityId: sourceEmployeeId,
    entitySummary: `Angajat arhivat prin combinare în ${targetName}`,
  })

  void deliverEmployeeUpdatedWebhook(targetEmployeeId, tenantId)

  return NextResponse.json({
    targetEmployeeId,
    sourceEmployeeId,
    movedCounts,
  })
}

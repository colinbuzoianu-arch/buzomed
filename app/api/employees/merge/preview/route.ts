import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

/**
 * GET /api/employees/merge/preview?sourceId=...&targetId=...
 *
 * Previews a duplicate-employee merge: how many rows in each clinical/
 * assignment model would be reassigned from `sourceId` to `targetId`.
 * No writes happen here — this is purely a count for the confirmation UI.
 *
 * Permission: canWriteAdministrative — merging is conceptually "employee
 * administration" (reassigning existing records, not rendering a new
 * clinical judgement), so all non-super_admin roles qualify, same as
 * employee create/edit.
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get('sourceId')
  const targetId = searchParams.get('targetId')

  if (!sourceId || !targetId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['sourceId and targetId are required'],
      },
      { status: 400 }
    )
  }
  if (sourceId === targetId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['sourceId and targetId must be different'],
      },
      { status: 400 }
    )
  }

  const tenantId = auth.user.tenantId

  const [source, target] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: sourceId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.employee.findFirst({
      where: { id: targetId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  if (!source || !target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const [assignments, examinations, vaccinations, medicalEvents, recalls] =
    await Promise.all([
      prisma.employeeWorkplaceAssignment.count({
        where: { employeeId: sourceId, tenantId },
      }),
      prisma.examination.count({
        where: { employeeId: sourceId, tenantId, deletedAt: null },
      }),
      prisma.vaccination.count({
        where: { employeeId: sourceId, tenantId, deletedAt: null },
      }),
      prisma.medicalEvent.count({
        where: { employeeId: sourceId, tenantId, deletedAt: null },
      }),
      prisma.recall.count({
        where: { employeeId: sourceId, tenantId, deletedAt: null },
      }),
    ])

  return NextResponse.json({
    source: { id: source.id, firstName: source.firstName, lastName: source.lastName },
    target: { id: target.id, firstName: target.firstName, lastName: target.lastName },
    counts: {
      assignments,
      examinations,
      vaccinations,
      medicalEvents,
      recalls,
    },
  })
}

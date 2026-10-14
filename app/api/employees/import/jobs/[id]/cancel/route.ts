import { type NextRequest, NextResponse } from 'next/server'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSystemError } from '@/lib/system-log/error-log'

/**
 * Cancel a bulk import (import spec §8, destructive — conservative variant).
 *
 * Restricted to practice_admin within the job's own tenant. The action is
 * deliberately narrow:
 *
 *   - Soft-deletes ONLY the employees this import created that have NO
 *     examinations yet. An employee who has since been examined carries
 *     clinical data we must never silently remove, so they are KEPT and
 *     reported back as such.
 *   - Soft-deletes the imported recalls (external fișă expiries) of the
 *     removed employees and ends their current workplace assignments.
 *   - Leaves companies and workplaces created by the import INTACT — they
 *     may already be shared by manually-added employees or other imports.
 *
 * Idempotent: a job already 'cancelled' returns its recorded counts.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  const tenantId = auth.user.tenantId
  const actorId = auth.user.id
  // Cancelling an import is destructive, so it is practice_admin-only even
  // though other roles can run an import.
  if (!tenantId || !auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const job = await prisma.importJob.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      status: true,
      removedEmployeeCount: true,
      keptEmployeeCount: true,
      fileName: true,
    },
  })
  if (!job) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (job.status === 'cancelled') {
    return NextResponse.json({
      status: 'cancelled',
      alreadyCancelled: true,
      removed: job.removedEmployeeCount ?? 0,
      kept: job.keptEmployeeCount ?? 0,
    })
  }

  try {
    // Employees this import created that are still live.
    const employees = await prisma.employee.findMany({
      where: { tenantId, importJobId: id, deletedAt: null },
      select: { id: true },
    })
    const employeeIds = employees.map((e) => e.id)

    // Which of them already have (non-deleted) examinations — those are kept.
    let keptIds = new Set<string>()
    if (employeeIds.length > 0) {
      const withExams = await prisma.examination.groupBy({
        by: ['employeeId'],
        where: { employeeId: { in: employeeIds }, deletedAt: null },
      })
      keptIds = new Set(withExams.map((g) => g.employeeId))
    }
    const removableIds = employeeIds.filter((eid) => !keptIds.has(eid))

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      if (removableIds.length > 0) {
        await tx.employee.updateMany({
          where: { id: { in: removableIds }, tenantId },
          data: { deletedAt: now, isActive: false },
        })
        // Imported recalls for the removed employees.
        await tx.recall.updateMany({
          where: {
            tenantId,
            importJobId: id,
            employeeId: { in: removableIds },
            deletedAt: null,
          },
          data: { deletedAt: now },
        })
        // End current workplace assignments (no deletedAt on this table).
        await tx.employeeWorkplaceAssignment.updateMany({
          where: { tenantId, employeeId: { in: removableIds }, isCurrent: true },
          data: { isCurrent: false, endDate: now },
        })
      }
      await tx.importJob.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelledByUserId: actorId,
          removedEmployeeCount: removableIds.length,
          keptEmployeeCount: keptIds.size,
        },
      })
    })

    const meta = getRequestMeta(request)
    void writeAuditLog({
      tenantId,
      userId: auth.user.id,
      action: 'delete',
      entityType: 'import_job',
      entityId: id,
      entitySummary: `Anulare import${job.fileName ? ` „${job.fileName}"` : ''} — ${removableIds.length} angajați eliminați, ${keptIds.size} păstrați (cu examinări)`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({
      status: 'cancelled',
      removed: removableIds.length,
      kept: keptIds.size,
    })
  } catch (err) {
    void logSystemError({
      tenantId,
      route: '/api/employees/import/jobs/[id]/cancel',
      method: 'POST',
      error: err,
      context: { importJobId: id },
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

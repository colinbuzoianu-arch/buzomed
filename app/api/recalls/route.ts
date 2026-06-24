import { type NextRequest, NextResponse } from 'next/server'
import type { Prisma, RecallStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'

/**
 * Recall list endpoint.
 *
 * Query parameters:
 *   - horizon: 'overdue' | 'thisWeek' | 'thisMonth' | 'next3Months' | 'all'
 *              (default: 'thisMonth')
 *   - companyId: optional, filter to recalls for workers at one company
 *
 * Always restricted to status in {pending, overdue}. Completed and
 * cancelled recalls are hidden — they're history, not actionable.
 *
 * Side effect on read: any `pending` recall whose due date has already
 * passed is upgraded to `overdue` in this query. This is the lazy
 * version of a daily cron. Costs one extra UPDATE per request but
 * keeps the dashboard always-correct.
 */

const VALID_HORIZONS = [
  'overdue',
  'thisWeek',
  'thisMonth',
  'next3Months',
  'all',
] as const
type Horizon = (typeof VALID_HORIZONS)[number]

function getHorizonRange(horizon: Horizon): {
  from: Date | null
  to: Date | null
} {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  switch (horizon) {
    case 'overdue':
      // Only items before today — no upper bound, no lower bound
      return { from: null, to: today }
    case 'thisWeek': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 7)
      return { from: today, to: end }
    }
    case 'thisMonth': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 30)
      return { from: today, to: end }
    }
    case 'next3Months': {
      const end = new Date(today)
      end.setUTCDate(today.getUTCDate() + 90)
      return { from: today, to: end }
    }
    case 'all':
      return { from: null, to: null }
  }
}

export async function GET(request: NextRequest) {
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

  // Lazy promotion: any pending recall whose dueDate has passed gets
  // upgraded to overdue. Done as part of the read so the dashboard
  // shows accurate counts without a cron job.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.recall.updateMany({
    where: {
      tenantId: auth.user.tenantId,
      status: 'pending',
      dueDate: { lt: today },
      deletedAt: null,
    },
    data: { status: 'overdue' },
  })

  const { searchParams } = new URL(request.url)
  const horizonParam = searchParams.get('horizon')
  const horizon: Horizon =
    horizonParam && VALID_HORIZONS.includes(horizonParam as Horizon)
      ? (horizonParam as Horizon)
      : 'thisMonth'
  const companyId = searchParams.get('companyId') || undefined

  const range = getHorizonRange(horizon)

  // Status: always exclude completed + cancelled. For 'overdue' filter,
  // restrict to status='overdue'. For other filters, allow both pending
  // AND overdue (overdue items always bubble to the top — see ordering).
  const statusFilter =
    horizon === 'overdue' ? { status: 'overdue' as const } : {
      status: { in: ['pending', 'overdue'] as RecallStatus[] },
    }

  const where: Prisma.RecallWhereInput = {
    tenantId: auth.user.tenantId,
    deletedAt: null,
    ...statusFilter,
    ...(range.from ? { dueDate: { gte: range.from } } : {}),
    ...(range.to
      ? horizon === 'overdue'
        ? { dueDate: { lt: range.to } }
        : { dueDate: { lte: range.to } }
      : {}),
    ...(companyId
      ? { workplace: { companyId, deletedAt: null } }
      : {}),
    // Hide recalls whose source examination has been soft-deleted. The
    // recall row remains in the DB (we want the audit trail) but it's
    // not actionable from the dashboard. createdFromExamination is
    // nullable on the schema, so we use OR to also include
    // recalls-without-a-source (none today, but conceivable later for
    // recalls created by employer-policy rather than an actual exam).
    OR: [
      { createdFromExaminationId: null },
      { createdFromExamination: { deletedAt: null } },
    ],
  }

  const recalls = await prisma.recall.findMany({
    where,
    orderBy: [
      // Overdue first (status=overdue sorts before pending alphabetically),
      // then by due date ascending so the most urgent is at the top.
      { status: 'asc' },
      { dueDate: 'asc' },
    ],
    take: 500,
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, archivedAt: true },
      },
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: {
        select: { id: true, nameRo: true, nameEn: true },
      },
    },
  })

  // Defensive: filter out recalls whose employee got archived since the
  // recall was created. Archive should auto-end recalls (see the
  // assignment-end-on-archive logic in session 5) but be defensive.
  const visible = recalls.filter((r) => r.employee.archivedAt === null)

  // Counts per horizon for the tab indicators.
  const overdueCount = await prisma.recall.count({
    where: {
      tenantId: auth.user.tenantId,
      status: 'overdue',
      deletedAt: null,
    },
  })

  return NextResponse.json({
    recalls: visible,
    counts: { overdue: overdueCount },
    horizon,
  })
}

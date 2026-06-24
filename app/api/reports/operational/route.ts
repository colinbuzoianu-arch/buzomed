import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import {
  parseDateRange,
  resolveDateRange,
  monthBucketsForRange,
} from '@/lib/reports/date-ranges'

/**
 * Operational report.
 *
 * Returns three blocks of data for the dashboard:
 *
 *   1. Headline counts for the selected range (total exams, verdict
 *      breakdown, signed-vs-pending, overdue recall count).
 *   2. Monthly trend table — one row per calendar month in the range
 *      with the same breakdown columns.
 *   3. Per-company breakdown for the range, sorted by total exams.
 *
 * Authorization: practice_admin + practitioner only. Assistants don't
 * see aggregate views (consistent with Q6 = (a) decision).
 *
 * Query params:
 *   - range: one of the predefined keys, defaults to thisMonth
 *
 * The endpoint is a single GET that returns all three blocks. The page
 * renders them in one scroll — no separate fetches needed.
 */

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // canReadTenantData is the floor — we also exclude assistants by
  // checking for practitioner / practice_admin roles directly.
  if (!canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Reports require practitioner role' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const rangeKey = parseDateRange(searchParams.get('range'))
  const range = resolveDateRange(rangeKey)

  try {
  // Block 1: headline counts. Single query, then post-process.
  const inRange = {
    tenantId: auth.user.tenantId,
    deletedAt: null,
    // We use createdAt for inclusion in the range, not scheduledAt — an
    // examination "belongs to" the month it was opened. Cabinets think
    // of activity that way. Open question: signed_at might be a better
    // axis if a cabinet runs long-open exams. Defer until feedback.
    createdAt: { gte: range.from, lt: range.to },
  }

  const headlineExams = await prisma.examination.findMany({
    where: inRange,
    take: 10000,
    select: {
      id: true,
      verdict: true,
      status: true,
      signedAt: true,
      createdAt: true,
    },
  })

  const headline = {
    total: headlineExams.length,
    byVerdict: {
      apt: headlineExams.filter((e) => e.verdict === 'apt').length,
      apt_conditionat: headlineExams.filter(
        (e) => e.verdict === 'apt_conditionat'
      ).length,
      inapt_temporar: headlineExams.filter(
        (e) => e.verdict === 'inapt_temporar'
      ).length,
      inapt: headlineExams.filter((e) => e.verdict === 'inapt').length,
      unset: headlineExams.filter((e) => e.verdict === null).length,
    },
    byStatus: {
      scheduled: headlineExams.filter((e) => e.status === 'scheduled').length,
      in_progress: headlineExams.filter((e) => e.status === 'in_progress')
        .length,
      completed: headlineExams.filter((e) => e.status === 'completed').length,
      cancelled: headlineExams.filter((e) => e.status === 'cancelled').length,
      no_show: headlineExams.filter((e) => e.status === 'no_show').length,
    },
    signed: headlineExams.filter((e) => e.signedAt !== null).length,
    unsigned: headlineExams.filter((e) => e.signedAt === null).length,
  }

  // Overdue recall count — single number. The dashboard links it to
  // /recalls?horizon=overdue. We don't filter by range — overdue is a
  // current-state metric.
  const overdueRecalls = await prisma.recall.count({
    where: {
      tenantId: auth.user.tenantId,
      status: 'overdue',
      deletedAt: null,
      OR: [
        { createdFromExaminationId: null },
        { createdFromExamination: { deletedAt: null } },
      ],
    },
  })

  // Block 2: monthly trend.
  const buckets = monthBucketsForRange(range)
  const monthlyTrend = buckets.map((b) => {
    const inBucket = headlineExams.filter(
      (e) => e.createdAt >= b.from && e.createdAt < b.to
    )
    return {
      year: b.year,
      month: b.month, // 0-indexed
      total: inBucket.length,
      apt: inBucket.filter((e) => e.verdict === 'apt').length,
      apt_conditionat: inBucket.filter((e) => e.verdict === 'apt_conditionat')
        .length,
      inapt_temporar: inBucket.filter((e) => e.verdict === 'inapt_temporar')
        .length,
      inapt: inBucket.filter((e) => e.verdict === 'inapt').length,
      signed: inBucket.filter((e) => e.signedAt !== null).length,
    }
  })

  // Block 3: per-company breakdown.
  const perCompanyRaw = await prisma.examination.findMany({
    where: inRange,
    take: 10000,
    select: {
      id: true,
      verdict: true,
      signedAt: true,
      workplace: {
        select: {
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  const perCompanyMap = new Map<
    string,
    {
      companyId: string
      companyName: string
      total: number
      apt: number
      apt_conditionat: number
      inapt_temporar: number
      inapt: number
      signed: number
    }
  >()
  for (const e of perCompanyRaw) {
    const c = e.workplace.company
    const existing = perCompanyMap.get(c.id) ?? {
      companyId: c.id,
      companyName: c.name,
      total: 0,
      apt: 0,
      apt_conditionat: 0,
      inapt_temporar: 0,
      inapt: 0,
      signed: 0,
    }
    existing.total += 1
    if (e.verdict === 'apt') existing.apt += 1
    if (e.verdict === 'apt_conditionat') existing.apt_conditionat += 1
    if (e.verdict === 'inapt_temporar') existing.inapt_temporar += 1
    if (e.verdict === 'inapt') existing.inapt += 1
    if (e.signedAt) existing.signed += 1
    perCompanyMap.set(c.id, existing)
  }
  const perCompany = Array.from(perCompanyMap.values()).sort(
    (a, b) => b.total - a.total
  )

  return NextResponse.json({
    range: {
      key: range.key,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    headline,
    overdueRecalls,
    monthlyTrend,
    perCompany,
  })
  } catch (err) {
    console.error('[reports/operational]', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

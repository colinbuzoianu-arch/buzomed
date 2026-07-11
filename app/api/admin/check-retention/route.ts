import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { runInBatches } from '@/lib/batch-parallel'

interface TenantRetentionResult {
  tenantId: string
  tenantName: string
  retentionYears: number
  expiredExaminations: number
  expiredDocuments: number
  oldestExpiredDate: string | null
}

const TENANT_CONCURRENCY = 10

export async function POST() {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, subscriptionStatus: { not: 'cancelled' } },
    select: { id: true, name: true, dataRetentionYears: true },
  })

  // Each tenant's counts are fully row-scoped/independent — safe to fan out
  // concurrently, bounded so an unbounded tenant count can't overwhelm the
  // deliberately thin serverless DB connection pool.
  const settled = await runInBatches(tenants, TENANT_CONCURRENCY, checkTenantRetention)

  const results: TenantRetentionResult[] = []
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value) {
      results.push(outcome.value)
    } else if (outcome.status === 'rejected') {
      console.error('[check-retention] tenant check failed:', outcome.reason)
    }
  }

  return NextResponse.json({ results })
}

async function checkTenantRetention(tenant: {
  id: string
  name: string
  dataRetentionYears: number
}): Promise<TenantRetentionResult | null> {
  const cutoffDate = new Date()
  cutoffDate.setFullYear(cutoffDate.getFullYear() - tenant.dataRetentionYears)

  const [expiredExams, expiredDocs] = await Promise.all([
    prisma.examination.count({
      where: { tenantId: tenant.id, deletedAt: null, createdAt: { lt: cutoffDate } },
    }),
    prisma.document.count({
      where: { tenantId: tenant.id, deletedAt: null, createdAt: { lt: cutoffDate } },
    }),
  ])

  if (expiredExams === 0 && expiredDocs === 0) return null

  const oldest = await prisma.examination.findFirst({
    where: { tenantId: tenant.id, deletedAt: null, createdAt: { lt: cutoffDate } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    retentionYears: tenant.dataRetentionYears,
    expiredExaminations: expiredExams,
    expiredDocuments: expiredDocs,
    oldestExpiredDate: oldest?.createdAt.toISOString().slice(0, 10) ?? null,
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

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

  const results = []

  for (const tenant of tenants) {
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

    if (expiredExams > 0 || expiredDocs > 0) {
      const oldest = await prisma.examination.findFirst({
        where: { tenantId: tenant.id, deletedAt: null, createdAt: { lt: cutoffDate } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        retentionYears: tenant.dataRetentionYears,
        expiredExaminations: expiredExams,
        expiredDocuments: expiredDocs,
        oldestExpiredDate: oldest?.createdAt.toISOString().slice(0, 10) ?? null,
      })
    }
  }

  return NextResponse.json({ results })
}

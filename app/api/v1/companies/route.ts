import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('companies:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
  const skip = (page - 1) * limit

  const where = { tenantId, deletedAt: null }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cui: true,
        registrationNumber: true,
        city: true,
        county: true,
        isActive: true,
        contracts: {
          where: { deletedAt: null, status: 'active' },
          orderBy: { startDate: 'desc' },
          take: 1,
          select: { startDate: true, endDate: true },
        },
      },
    }),
    prisma.company.count({ where }),
  ])

  const data = companies.map((c) => ({
    id: c.id,
    name: c.name,
    cui: c.cui,
    registrationNumber: c.registrationNumber,
    city: c.city,
    county: c.county,
    isActive: c.isActive,
    contractStartDate: c.contracts[0]?.startDate ?? null,
    contractEndDate: c.contracts[0]?.endDate ?? null,
  }))

  return NextResponse.json({ data, total, page, limit }, { headers: rlHeaders })
}

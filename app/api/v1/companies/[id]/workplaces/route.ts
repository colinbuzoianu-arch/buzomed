import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('companies:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }
  const { id: companyId } = await params

  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  const workplaces = await prisma.workplace.findMany({
    where: { companyId, tenantId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true, isActive: true, createdAt: true },
  })

  return NextResponse.json({ data: workplaces, total: workplaces.length }, { headers: rlHeaders })
}

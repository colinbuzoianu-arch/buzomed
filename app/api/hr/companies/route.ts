import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

export async function GET() {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.roles.includes('company_hr')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const assignments = await prisma.companyHrAssignment.findMany({
    where: { userId: auth.user.id },
    select: {
      tenantId: true,
      company: {
        select: { id: true, name: true, city: true },
      },
    },
  })

  if (assignments.length === 0) {
    return NextResponse.json({ companies: [] })
  }

  const tenantIds = new Set(assignments.map((a) => a.tenantId))
  if (tenantIds.size > 1) {
    console.error('[hr/companies] multi-tenant HR user detected', { userId: auth.user.id, tenantIds: [...tenantIds] })
    return NextResponse.json({ error: 'multi_tenant_hr_not_supported' }, { status: 500 })
  }

  return NextResponse.json({
    companies: assignments.map((a) => a.company),
  })
}

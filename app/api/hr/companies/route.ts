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
      company: {
        select: { id: true, name: true, city: true },
      },
    },
  })

  return NextResponse.json({
    companies: assignments.map((a) => a.company),
  })
}

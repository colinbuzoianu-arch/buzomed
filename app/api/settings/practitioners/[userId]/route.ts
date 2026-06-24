import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { asObject, optionalString } from '@/lib/validation'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { userId } = await ctx.params
  const isSelf = auth.user.id === userId
  const isAdmin = auth.user.roles.includes('practice_admin')

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Target user must be in same tenant
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const issues: string[] = []

  const professionalTitle = optionalString('professionalTitle', body.professionalTitle, issues, { maxLength: 100 })
  const specialty         = optionalString('specialty', body.specialty, issues, { maxLength: 200 })
  const professionalCode  = optionalString('professionalCode', body.professionalCode, issues, { maxLength: 20 })

  if (issues.length > 0) return NextResponse.json({ error: issues[0] }, { status: 400 })

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(professionalTitle !== undefined && { professionalTitle }),
      ...(specialty !== undefined && { specialty }),
      ...(professionalCode !== undefined && { professionalCode }),
    },
    select: { id: true, professionalTitle: true, specialty: true, professionalCode: true, stampImageUrl: true },
  })

  return NextResponse.json({ user })
}

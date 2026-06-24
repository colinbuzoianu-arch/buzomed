import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const companyId = request.nextUrl.searchParams.get('companyId') || null

  const [companies, workplaces, examinationTypes, practitioners] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: auth.user.tenantId, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    companyId
      ? prisma.workplace.findMany({
          where: { tenantId: auth.user.tenantId, companyId, deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, department: true },
        })
      : Promise.resolve([]),
    prisma.examinationType.findMany({
      where: { isActive: true },
      orderBy: { nameRo: 'asc' },
      select: { id: true, nameRo: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId: auth.user.tenantId,
        isActive: true,
        deletedAt: null,
        roles: { hasSome: ['practitioner', 'practice_admin'] },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, professionalTitle: true },
    }),
  ])

  // Distinct departments from workplaces for the company
  const departments = companyId
    ? [...new Set(workplaces.map((w) => w.department).filter(Boolean) as string[])].sort()
    : []

  return NextResponse.json({
    companies,
    workplaces: workplaces.map(({ id, name }) => ({ id, name })),
    departments,
    examinationTypes: examinationTypes.map(({ id, nameRo }) => ({ id, name: nameRo })),
    practitioners: practitioners.map((p) => ({
      id: p.id,
      label: `${p.lastName} ${p.firstName}${p.professionalTitle ? ` (${p.professionalTitle})` : ''}`,
    })),
  })
}

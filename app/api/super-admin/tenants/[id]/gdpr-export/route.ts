import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const [tenant, employees, examinations, companies, users] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id },
      select: { id: true, name: true, cui: true, email: true, createdAt: true, subscriptionTier: true },
    }),
    prisma.employee.findMany({
      where: { tenantId: id },
      select: {
        id: true, firstName: true, lastName: true, birthDate: true,
        jobTitle: true, city: true, email: true, phone: true,
        companyEmployeeId: true, bloodType: true, allergies: true,
        createdAt: true, archivedAt: true, deletedAt: true,
        company: { select: { name: true, cui: true } },
        workplaceAssignments: { select: { workplace: { select: { name: true } }, startDate: true, endDate: true } },
      },
    }),
    prisma.examination.findMany({
      where: { tenantId: id },
      select: {
        id: true, examinationNumber: true, status: true, verdict: true,
        scheduledAt: true, completedAt: true, signedAt: true,
        employee: { select: { firstName: true, lastName: true } },
        examinationType: { select: { nameRo: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.company.findMany({
      where: { tenantId: id },
      select: { id: true, name: true, cui: true, city: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { tenantId: id },
      select: { id: true, firstName: true, lastName: true, email: true, roles: true, createdAt: true },
    }),
  ])

  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: `${auth.user.firstName} ${auth.user.lastName}`,
    tenant,
    users,
    companies,
    employees,
    examinations,
  }

  // CNP is encrypted in DB and not included here — requires separate decryption on a specific GDPR request
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="buzomed-gdpr-export-${id}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}

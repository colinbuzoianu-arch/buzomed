import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteClinical } from '@/lib/permissions/tenant-data'
import type { AdministrationRoute } from '@prisma/client'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: employeeId } = await ctx.params

  const vaccinations = await prisma.vaccination.findMany({
    where: { employeeId, tenantId: auth.user.tenantId, deletedAt: null },
    orderBy: { administrationDate: 'desc' },
    select: {
      id: true,
      vaccineName: true,
      vaccineCode: true,
      manufacturer: true,
      batchNumber: true,
      doseNumber: true,
      administrationDate: true,
      nextDoseDueDate: true,
      administrationRoute: true,
      injectionSite: true,
      reactionsObserved: true,
      notes: true,
      administeredBy: { select: { firstName: true, lastName: true } },
      examination: { select: { id: true, examinationNumber: true } },
    },
  })

  return NextResponse.json({ vaccinations })
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: employeeId } = await ctx.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const vaccination = await prisma.vaccination.create({
    data: {
      tenantId: auth.user.tenantId,
      employeeId,
      administeredByUserId: auth.user.id,
      vaccineName: String(body.vaccineName ?? '').trim(),
      vaccineCode: body.vaccineCode ? String(body.vaccineCode).trim() : null,
      manufacturer: body.manufacturer ? String(body.manufacturer).trim() : null,
      batchNumber: body.batchNumber ? String(body.batchNumber).trim() : null,
      doseNumber: Number(body.doseNumber ?? 1),
      administrationDate: new Date(body.administrationDate),
      nextDoseDueDate: body.nextDoseDueDate ? new Date(body.nextDoseDueDate) : null,
      administrationRoute: (body.administrationRoute as AdministrationRoute) ?? null,
      injectionSite: body.injectionSite ? String(body.injectionSite).trim() : null,
      reactionsObserved: body.reactionsObserved ? String(body.reactionsObserved).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
    },
    select: {
      id: true,
      vaccineName: true,
      vaccineCode: true,
      manufacturer: true,
      batchNumber: true,
      doseNumber: true,
      administrationDate: true,
      nextDoseDueDate: true,
      administrationRoute: true,
      injectionSite: true,
      reactionsObserved: true,
      notes: true,
      administeredBy: { select: { firstName: true, lastName: true } },
      examination: { select: { id: true, examinationNumber: true } },
    },
  })

  return NextResponse.json({ vaccination }, { status: 201 })
}

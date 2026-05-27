import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteClinical } from '@/lib/permissions/tenant-data'
import type { MedicalEventType, MedicalEventOutcome } from '@prisma/client'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: employeeId } = await ctx.params

  const events = await prisma.medicalEvent.findMany({
    where: { employeeId, tenantId: auth.user.tenantId, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    select: {
      id: true,
      eventType: true,
      occurredAt: true,
      locationDescription: true,
      description: true,
      actionsTaken: true,
      outcome: true,
      outcomeNotes: true,
      requiresIthsReport: true,
      ithsReportFiled: true,
      notes: true,
      practitioner: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  })

  return NextResponse.json({ events })
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: employeeId } = await ctx.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  if (!body.description || !body.eventType || !body.occurredAt) {
    return NextResponse.json({ error: 'validation_error', message: 'Câmpurile obligatorii lipsesc.' }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, companyId: true },
  })
  if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const event = await prisma.medicalEvent.create({
    data: {
      tenantId: auth.user.tenantId,
      employeeId,
      practitionerId: auth.user.id,
      companyId: employee.companyId ?? null,
      eventType: body.eventType as MedicalEventType,
      occurredAt: new Date(body.occurredAt),
      locationDescription: body.locationDescription ? String(body.locationDescription).trim() : null,
      description: String(body.description).trim(),
      actionsTaken: body.actionsTaken ? String(body.actionsTaken).trim() : null,
      outcome: (body.outcome as MedicalEventOutcome) ?? null,
      outcomeNotes: body.outcomeNotes ? String(body.outcomeNotes).trim() : null,
      requiresIthsReport: Boolean(body.requiresIthsReport),
      notes: body.notes ? String(body.notes).trim() : null,
    },
    select: {
      id: true,
      eventType: true,
      occurredAt: true,
      locationDescription: true,
      description: true,
      actionsTaken: true,
      outcome: true,
      outcomeNotes: true,
      requiresIthsReport: true,
      ithsReportFiled: true,
      notes: true,
      practitioner: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  })

  return NextResponse.json({ event }, { status: 201 })
}

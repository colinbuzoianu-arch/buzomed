import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseContractInput } from '../route'

interface RouteContext {
  params: Promise<{ id: string; cid: string }>
}

async function loadContractForActor(
  companyId: string,
  contractId: string,
  tenantId: string
) {
  return prisma.contract.findFirst({
    where: { id: contractId, companyId, tenantId, deletedAt: null },
  })
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, cid } = await ctx.params
  const contract = await loadContractForActor(companyId, cid, auth.user.tenantId)
  if (!contract) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({ contract })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, cid } = await ctx.params
  const existing = await loadContractForActor(companyId, cid, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) {
    return NextResponse.json({ error: 'invalid_json', message: 'Body must be a JSON object' }, { status: 400 })
  }

  const issues: string[] = []
  const data = parseContractInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}

  if (data.startDate !== undefined) updateData.startDate = data.startDate
  if ('endDate' in body) {
    updateData.endDate = body.endDate === null || body.endDate === '' ? null : data.endDate
  }
  if (data.services !== undefined) updateData.services = data.services
  if (data.pricePerExamination !== undefined) {
    updateData.pricePerExamination = new Prisma.Decimal(data.pricePerExamination)
  }
  if ('pricePerExamination' in body && (body.pricePerExamination === null)) {
    updateData.pricePerExamination = null
  }
  if (data.priceMonthlyFlat !== undefined) {
    updateData.priceMonthlyFlat = new Prisma.Decimal(data.priceMonthlyFlat)
  }
  if ('priceMonthlyFlat' in body && body.priceMonthlyFlat === null) {
    updateData.priceMonthlyFlat = null
  }
  if (data.currency !== undefined) updateData.currency = data.currency
  if (data.status !== undefined) updateData.status = data.status
  if ('notes' in body) {
    updateData.notes = data.notes ?? null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ contract: existing })
  }

  const contract = await prisma.contract.update({
    where: { id: cid },
    data: updateData,
  })

  return NextResponse.json({ contract })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, cid } = await ctx.params
  const existing = await loadContractForActor(companyId, cid, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  await prisma.contract.update({
    where: { id: cid },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

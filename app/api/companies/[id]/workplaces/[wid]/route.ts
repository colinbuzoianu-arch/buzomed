import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseWorkplaceInput } from '../route'

interface RouteContext {
  params: Promise<{ id: string; wid: string }>
}

async function loadWorkplaceForActor(
  companyId: string,
  workplaceId: string,
  tenantId: string
) {
  return prisma.workplace.findFirst({
    where: {
      id: workplaceId,
      companyId,
      tenantId,
      deletedAt: null,
    },
  })
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, wid } = await ctx.params
  const workplace = await loadWorkplaceForActor(
    companyId,
    wid,
    auth.user.tenantId
  )
  if (!workplace) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ workplace })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, wid } = await ctx.params
  const existing = await loadWorkplaceForActor(
    companyId,
    wid,
    auth.user.tenantId
  )
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
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400 }
    )
  }

  const issues: string[] = []
  const data = parseWorkplaceInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const clearableStringFields = ['department', 'description'] as const

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.examinationIntervalMonths !== undefined) {
    updateData.examinationIntervalMonths = data.examinationIntervalMonths
  }
  if (data.riskAssessmentSignedByCompany !== undefined) {
    updateData.riskAssessmentSignedByCompany =
      data.riskAssessmentSignedByCompany
  }
  if (data.riskAssessmentSignedAt !== undefined) {
    updateData.riskAssessmentSignedAt = data.riskAssessmentSignedAt
  }
  if ('riskAssessmentSignedAt' in body &&
      (body.riskAssessmentSignedAt === null || body.riskAssessmentSignedAt === '')) {
    updateData.riskAssessmentSignedAt = null
  }
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  for (const field of clearableStringFields) {
    if (!(field in body)) continue
    const incoming = body[field]
    if (incoming === null || incoming === '') {
      updateData[field] = null
    } else if (data[field as keyof typeof data] !== undefined) {
      updateData[field] = data[field as keyof typeof data]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ workplace: existing })
  }

  const workplace = await prisma.workplace.update({
    where: { id: wid },
    data: updateData,
  })

  return NextResponse.json({ workplace })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, wid } = await ctx.params
  const existing = await loadWorkplaceForActor(
    companyId,
    wid,
    auth.user.tenantId
  )
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Soft-delete the workplace AND end any open assignments at the same
  // time. Leaving open assignments pointing at a deleted workplace makes
  // "who is assigned where" queries lie.
  await prisma.$transaction([
    prisma.employeeWorkplaceAssignment.updateMany({
      where: {
        workplaceId: wid,
        tenantId: auth.user.tenantId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
        endDate: new Date(),
      },
    }),
    prisma.workplace.update({
      where: { id: wid },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}

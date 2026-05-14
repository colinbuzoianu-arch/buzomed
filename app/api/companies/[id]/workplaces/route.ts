import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import {
  asObject,
  optionalDate,
  optionalString,
  requireString,
} from '@/lib/validation'

/**
 * Workplaces are scoped under a Company. The URL shape
 * /api/companies/[id]/workplaces enforces that scoping — there is no
 * top-level /api/workplaces endpoint because workplaces never make
 * sense outside their parent company.
 *
 * Risk profile (JSONB `riskProfile`) and required examination type IDs
 * are session-5-deferred — they depend on Examination Types which don't
 * exist yet. Stored as empty default ({} / []) and surfaced in session 6.
 *
 * The risk-assessment-signed pair IS surfaced here because it's a property
 * the cabinet sets directly (the company hands them a signed risk
 * assessment document; the cabinet ticks it off and records the date).
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true, tenantId: true, name: true },
  })
}

export async function GET(request: NextRequest, ctx: RouteContext) {
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

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const where: Prisma.WorkplaceWhereInput = {
    tenantId: auth.user.tenantId,
    companyId,
    deletedAt: null,
    ...(includeInactive ? {} : { isActive: true }),
  }

  const workplaces = await prisma.workplace.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      department: true,
      description: true,
      isActive: true,
      examinationIntervalMonths: true,
      riskAssessmentSignedByCompany: true,
      riskAssessmentSignedAt: true,
      createdAt: true,
      _count: {
        select: {
          employeeAssignments: {
            where: { isCurrent: true },
          },
        },
      },
    },
  })

  return NextResponse.json({ workplaces })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
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

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
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
  const data = parseWorkplaceInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const workplace = await prisma.workplace.create({
    data: {
      tenantId: auth.user.tenantId,
      companyId,
      createdByUserId: auth.user.id,
      name: data.name!,
      department: data.department,
      description: data.description,
      examinationIntervalMonths: data.examinationIntervalMonths ?? 12,
      riskAssessmentSignedByCompany:
        data.riskAssessmentSignedByCompany ?? false,
      riskAssessmentSignedAt: data.riskAssessmentSignedAt,
      isActive: data.isActive ?? true,
      // riskProfile and requiredExaminationTypeIds use schema defaults
      // ({} and [] respectively). Surfaced in session 6.
    },
  })

  return NextResponse.json({ workplace }, { status: 201 })
}

export interface ParsedWorkplaceInput {
  name?: string
  department?: string
  description?: string
  examinationIntervalMonths?: number
  riskAssessmentSignedByCompany?: boolean
  riskAssessmentSignedAt?: Date
  isActive?: boolean
}

export function parseWorkplaceInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedWorkplaceInput {
  const result: ParsedWorkplaceInput = {}

  result.name = opts.isCreate
    ? requireString('name', body.name, issues, { maxLength: 200 })
    : optionalString('name', body.name, issues, { maxLength: 200 })

  result.department = optionalString('department', body.department, issues, {
    maxLength: 100,
  })
  result.description = optionalString('description', body.description, issues, {
    maxLength: 4000,
  })

  if (body.examinationIntervalMonths !== undefined) {
    const v = body.examinationIntervalMonths
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 60) {
      issues.push('examinationIntervalMonths must be an integer between 1 and 60')
    } else {
      result.examinationIntervalMonths = v
    }
  }

  if (body.riskAssessmentSignedByCompany !== undefined) {
    if (typeof body.riskAssessmentSignedByCompany !== 'boolean') {
      issues.push('riskAssessmentSignedByCompany must be a boolean')
    } else {
      result.riskAssessmentSignedByCompany = body.riskAssessmentSignedByCompany
    }
  }

  result.riskAssessmentSignedAt = optionalDate(
    'riskAssessmentSignedAt',
    body.riskAssessmentSignedAt,
    issues
  )

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      result.isActive = body.isActive
    }
  }

  // Cross-field: if the cabinet ticked "signed" but didn't pick a date,
  // and vice versa, we don't reject — the signed flag is the source of
  // truth. The date is optional context. Real-world the form prevents
  // this anyway.

  return result
}

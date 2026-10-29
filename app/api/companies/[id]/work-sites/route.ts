import { type NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject, optionalString, requireString } from '@/lib/validation'

/**
 * Puncte de lucru (WorkSite) are scoped under a Company, exactly like
 * workplaces: /api/companies/[id]/work-sites. A WorkSite is the employer's
 * territorial unit (branch / sucursală); workplaces (activity/risk units)
 * then belong to a site. See prisma/schema.prisma and lib/workplaces/format.ts.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  })
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
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

  const where: Prisma.WorkSiteWhereInput = {
    tenantId: auth.user.tenantId,
    companyId,
    deletedAt: null,
    ...(includeInactive ? {} : { isActive: true }),
  }

  const workSites = await prisma.workSite.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      addressLine1: true,
      city: true,
      county: true,
      isActive: true,
      createdAt: true,
      _count: { select: { workplaces: { where: { deletedAt: null } } } },
    },
  })

  return NextResponse.json({ workSites })
}

export interface ParsedWorkSiteInput {
  name?: string
  addressLine1?: string
  city?: string
  county?: string
  isActive?: boolean
}

export function parseWorkSiteInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedWorkSiteInput {
  const result: ParsedWorkSiteInput = {}

  result.name = opts.isCreate
    ? requireString('name', body.name, issues, { maxLength: 200 })
    : optionalString('name', body.name, issues, { maxLength: 200 })

  result.addressLine1 = optionalString('addressLine1', body.addressLine1, issues, {
    maxLength: 300,
  })
  result.city = optionalString('city', body.city, issues, { maxLength: 120 })
  result.county = optionalString('county', body.county, issues, { maxLength: 120 })

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') issues.push('isActive must be a boolean')
    else result.isActive = body.isActive
  }

  return result
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
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
  const data = parseWorkSiteInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }
  // requireString already guaranteed a name on create (issues would be set);
  // narrow it for the type system without a non-null assertion.
  const name = data.name
  if (!name) {
    return NextResponse.json({ error: 'validation_failed', issues: ['name is required'] }, { status: 400 })
  }

  let workSite: Awaited<ReturnType<typeof prisma.workSite.create>>
  try {
    workSite = await prisma.workSite.create({
      data: {
        tenantId: auth.user.tenantId,
        companyId,
        createdByUserId: auth.user.id,
        name,
        addressLine1: data.addressLine1,
        city: data.city,
        county: data.county,
        isActive: data.isActive ?? true,
      },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'conflict', message: 'A work site with this name already exists in this company.' },
        { status: 409 }
      )
    }
    throw err
  }

  return NextResponse.json({ workSite }, { status: 201 })
}

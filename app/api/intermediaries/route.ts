import type { Prisma } from '@prisma/client'
import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject, optionalEmail, optionalString, requireString } from '@/lib/validation'

/**
 * GET /api/intermediaries
 *
 * Lists intermediaries (MedLife, Regina Maria, etc.) for the authenticated
 * user's tenant. Soft-deleted rows are excluded. Mirrors
 * app/api/companies/route.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'User is not a member of any tenant' },
      { status: 403 }
    )
  }
  if (!canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()
  const includeInactive = searchParams.get('includeInactive') === 'true'

  const where: Prisma.IntermediaryWhereInput = {
    tenantId: auth.user.tenantId,
    deletedAt: null,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { cui: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const intermediaries = await prisma.intermediary.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { companies: { where: { deletedAt: null } } } } },
    take: 200,
  })

  return NextResponse.json({ intermediaries })
}

/**
 * POST /api/intermediaries
 *
 * Creates an intermediary in the authenticated user's tenant. Only
 * practice_admin, practitioner, and assistant can write (administrative
 * write), same as companies.
 */
export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'User is not a member of any tenant' },
      { status: 403 }
    )
  }
  if (!canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
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
  const data = parseIntermediaryInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const intermediary = await prisma.intermediary.create({
    data: {
      tenantId: auth.user.tenantId,
      // `name` is required on create — parseIntermediaryInput will have
      // pushed an issue otherwise, so the non-null assertion is safe here.
      name: data.name!,
      cui: data.cui,
      nrRegCom: data.nrRegCom,
      address: data.address,
      city: data.city,
      county: data.county,
      iban: data.iban,
      bank: data.bank,
      contactPersonName: data.contactPersonName,
      contactPersonEmail: data.contactPersonEmail,
      contactPersonPhone: data.contactPersonPhone,
      notes: data.notes,
      isActive: data.isActive ?? true,
    },
  })

  return NextResponse.json({ intermediary }, { status: 201 })
}

/**
 * Shared parser for create + update bodies. Mirrors parseCompanyInput in
 * app/api/companies/route.ts.
 */
export interface ParsedIntermediaryInput {
  name?: string
  cui?: string
  nrRegCom?: string
  address?: string
  city?: string
  county?: string
  iban?: string
  bank?: string
  contactPersonName?: string
  contactPersonEmail?: string
  contactPersonPhone?: string
  notes?: string
  isActive?: boolean
}

export function parseIntermediaryInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedIntermediaryInput {
  const name = opts.isCreate
    ? requireString('name', body.name, issues, { maxLength: 200 })
    : optionalString('name', body.name, issues, { maxLength: 200 })

  const result: ParsedIntermediaryInput = {
    name,
    cui: optionalString('cui', body.cui, issues, { maxLength: 20 }),
    nrRegCom: optionalString('nrRegCom', body.nrRegCom, issues, { maxLength: 50 }),
    address: optionalString('address', body.address, issues, { maxLength: 300 }),
    city: optionalString('city', body.city, issues, { maxLength: 100 }),
    county: optionalString('county', body.county, issues, { maxLength: 100 }),
    iban: optionalString('iban', body.iban, issues, { maxLength: 40 }),
    bank: optionalString('bank', body.bank, issues, { maxLength: 100 }),
    contactPersonName: optionalString('contactPersonName', body.contactPersonName, issues, {
      maxLength: 200,
    }),
    contactPersonEmail: optionalEmail('contactPersonEmail', body.contactPersonEmail, issues),
    contactPersonPhone: optionalString('contactPersonPhone', body.contactPersonPhone, issues, {
      maxLength: 200,
    }),
    notes: optionalString('notes', body.notes, issues, { maxLength: 500 }),
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      result.isActive = body.isActive
    }
  }

  return result
}

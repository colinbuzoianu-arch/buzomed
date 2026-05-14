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
  optionalEmail,
  optionalString,
  requireString,
} from '@/lib/validation'

/**
 * GET /api/companies
 *
 * Lists companies for the authenticated user's tenant. Soft-deleted rows
 * are excluded. Query params:
 *   - search: case-insensitive substring match on name
 *   - includeInactive: 'true' to include rows with isActive=false
 *
 * Tenant scoping is enforced by reading user.tenantId, never the request
 * body — clients can't ask for "another tenant's companies".
 */
export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
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

  const where: Prisma.CompanyWhereInput = {
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

  const companies = await prisma.company.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 200,
  })

  return NextResponse.json({ companies })
}

/**
 * POST /api/companies
 *
 * Creates a company in the authenticated user's tenant. Only practice_admin
 * and practitioner can write; assistants are read-only.
 */
export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
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
  const data = parseCompanyInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const company = await prisma.company.create({
    data: {
      tenantId: auth.user.tenantId,
      // `name` is required on create — parseCompanyInput will have pushed
      // an issue otherwise, so the non-null assertion is safe here.
      name: data.name!,
      cui: data.cui,
      registrationNumber: data.registrationNumber,
      caenCode: data.caenCode,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      county: data.county,
      postalCode: data.postalCode,
      phone: data.phone,
      email: data.email,
      website: data.website,
      contactPersonName: data.contactPersonName,
      contactPersonRole: data.contactPersonRole,
      contactPersonPhone: data.contactPersonPhone,
      contactPersonEmail: data.contactPersonEmail,
      contractStartDate: data.contractStartDate,
      contractEndDate: data.contractEndDate,
      notes: data.notes,
      isActive: data.isActive ?? true,
    },
  })

  return NextResponse.json({ company }, { status: 201 })
}

/**
 * Shared parser for create + update bodies.
 *
 * On create, `name` is required. On update, every field is optional and
 * undefined means "don't touch this column" — we don't want a PATCH that
 * omits `notes` to clobber an existing value.
 */
export interface ParsedCompanyInput {
  name?: string
  cui?: string
  registrationNumber?: string
  caenCode?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  county?: string
  postalCode?: string
  phone?: string
  email?: string
  website?: string
  contactPersonName?: string
  contactPersonRole?: string
  contactPersonPhone?: string
  contactPersonEmail?: string
  contractStartDate?: Date
  contractEndDate?: Date
  notes?: string
  isActive?: boolean
}

export function parseCompanyInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedCompanyInput {
  const name = opts.isCreate
    ? requireString('name', body.name, issues, { maxLength: 200 })
    : optionalString('name', body.name, issues, { maxLength: 200 })

  const result: ParsedCompanyInput = {
    name,
    cui: optionalString('cui', body.cui, issues, { maxLength: 32 }),
    registrationNumber: optionalString(
      'registrationNumber',
      body.registrationNumber,
      issues,
      { maxLength: 64 }
    ),
    caenCode: optionalString('caenCode', body.caenCode, issues, {
      maxLength: 16,
    }),
    addressLine1: optionalString('addressLine1', body.addressLine1, issues, {
      maxLength: 200,
    }),
    addressLine2: optionalString('addressLine2', body.addressLine2, issues, {
      maxLength: 200,
    }),
    city: optionalString('city', body.city, issues, { maxLength: 100 }),
    county: optionalString('county', body.county, issues, { maxLength: 100 }),
    postalCode: optionalString('postalCode', body.postalCode, issues, {
      maxLength: 20,
    }),
    phone: optionalString('phone', body.phone, issues, { maxLength: 50 }),
    email: optionalEmail('email', body.email, issues),
    website: optionalString('website', body.website, issues, { maxLength: 200 }),
    contactPersonName: optionalString(
      'contactPersonName',
      body.contactPersonName,
      issues,
      { maxLength: 200 }
    ),
    contactPersonRole: optionalString(
      'contactPersonRole',
      body.contactPersonRole,
      issues,
      { maxLength: 100 }
    ),
    contactPersonPhone: optionalString(
      'contactPersonPhone',
      body.contactPersonPhone,
      issues,
      { maxLength: 50 }
    ),
    contactPersonEmail: optionalEmail(
      'contactPersonEmail',
      body.contactPersonEmail,
      issues
    ),
    contractStartDate: optionalDate(
      'contractStartDate',
      body.contractStartDate,
      issues
    ),
    contractEndDate: optionalDate(
      'contractEndDate',
      body.contractEndDate,
      issues
    ),
    notes: optionalString('notes', body.notes, issues, { maxLength: 4000 }),
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      result.isActive = body.isActive
    }
  }

  // Cross-field check: contract end can't be before start.
  if (
    result.contractStartDate &&
    result.contractEndDate &&
    result.contractEndDate < result.contractStartDate
  ) {
    issues.push('contractEndDate cannot be earlier than contractStartDate')
  }

  return result
}

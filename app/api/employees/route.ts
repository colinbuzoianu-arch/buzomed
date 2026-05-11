import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import type { IdDocumentType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import {
  asObject,
  optionalDate,
  optionalEmail,
  optionalString,
  requireString,
} from '@/lib/validation'

/**
 * Employee CRUD — session 4 scope.
 *
 * Important schema constraints honored here:
 *
 *   - Employees are tenant-scoped; no direct companyId column. The link
 *     to Company comes via Workplace assignments, which arrive in
 *     session 5. Until then, employees are unaffiliated within a tenant.
 *
 *   - CNP encryption is deferred. The schema has cnpEncrypted + cnpHash
 *     for pgcrypto-based storage, but no helpers exist yet. We accept
 *     idDocumentType + idDocumentNumber for non-CNP cases and refuse
 *     idDocumentType=cnp until the encryption subsystem lands.
 */

const ID_DOCUMENT_TYPES_WITHOUT_CNP: IdDocumentType[] = [
  'passport',
  'eu_id_card',
  'other',
]

const ARCHIVED_REASONS = [
  'left_employment',
  'retired',
  'deceased',
  'transferred',
  'other',
] as const

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
  const includeArchived = searchParams.get('includeArchived') === 'true'

  const where: Prisma.EmployeeWhereInput = {
    tenantId: auth.user.tenantId,
    deletedAt: null,
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { lastName: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { companyEmployeeId: { contains: search, mode: 'insensitive' } },
            { idDocumentNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [
      { archivedAt: 'asc' }, // active (null) first
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      idDocumentType: true,
      idDocumentNumber: true,
      companyEmployeeId: true,
      birthDate: true,
      gender: true,
      phone: true,
      email: true,
      isActive: true,
      archivedAt: true,
      archivedReason: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 200,
  })

  return NextResponse.json({ employees })
}

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
  if (!canWriteTenantData(auth.user, auth.user.tenantId)) {
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
  const data = parseEmployeeInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const employee = await prisma.employee.create({
    data: {
      tenantId: auth.user.tenantId,
      createdByUserId: auth.user.id,
      firstName: data.firstName!,
      lastName: data.lastName!,
      idDocumentType: data.idDocumentType ?? 'other',
      idDocumentNumber: data.idDocumentNumber,
      companyEmployeeId: data.companyEmployeeId,
      birthDate: data.birthDate,
      gender: data.gender,
      nationality: data.nationality ?? 'RO',
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      city: data.city,
      county: data.county,
      postalCode: data.postalCode,
      phone: data.phone,
      email: data.email,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
      emergencyContactRelationship: data.emergencyContactRelationship,
      bloodType: data.bloodType,
      notes: data.notes,
      isActive: data.isActive ?? true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idDocumentType: true,
      idDocumentNumber: true,
      isActive: true,
      archivedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ employee }, { status: 201 })
}

export interface ParsedEmployeeInput {
  firstName?: string
  lastName?: string
  idDocumentType?: IdDocumentType
  idDocumentNumber?: string
  companyEmployeeId?: string
  birthDate?: Date
  gender?: string
  nationality?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  county?: string
  postalCode?: string
  phone?: string
  email?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  emergencyContactRelationship?: string
  bloodType?: string
  notes?: string
  isActive?: boolean
  archivedReason?: (typeof ARCHIVED_REASONS)[number]
  archive?: boolean // PATCH-only: explicit "archive now" flag
  unarchive?: boolean // PATCH-only: explicit "unarchive" flag
}

export function parseEmployeeInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedEmployeeInput {
  const result: ParsedEmployeeInput = {}

  result.firstName = opts.isCreate
    ? requireString('firstName', body.firstName, issues, { maxLength: 100 })
    : optionalString('firstName', body.firstName, issues, { maxLength: 100 })

  result.lastName = opts.isCreate
    ? requireString('lastName', body.lastName, issues, { maxLength: 100 })
    : optionalString('lastName', body.lastName, issues, { maxLength: 100 })

  // ID document type — restricted set while CNP encryption is unbuilt.
  if (body.idDocumentType !== undefined && body.idDocumentType !== null) {
    if (typeof body.idDocumentType !== 'string') {
      issues.push('idDocumentType must be a string')
    } else if (body.idDocumentType === 'cnp') {
      issues.push(
        'idDocumentType=cnp is not yet supported (encryption pending). Use passport, eu_id_card, or other.'
      )
    } else if (
      !ID_DOCUMENT_TYPES_WITHOUT_CNP.includes(
        body.idDocumentType as IdDocumentType
      )
    ) {
      issues.push(
        `idDocumentType must be one of: ${ID_DOCUMENT_TYPES_WITHOUT_CNP.join(', ')}`
      )
    } else {
      result.idDocumentType = body.idDocumentType as IdDocumentType
    }
  }

  result.idDocumentNumber = optionalString(
    'idDocumentNumber',
    body.idDocumentNumber,
    issues,
    { maxLength: 64 }
  )
  result.companyEmployeeId = optionalString(
    'companyEmployeeId',
    body.companyEmployeeId,
    issues,
    { maxLength: 64 }
  )
  result.birthDate = optionalDate('birthDate', body.birthDate, issues)

  // Gender: free-form per schema comment, but constrain to a small set
  // for predictable filtering. Accept null/empty to clear.
  if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
    if (
      typeof body.gender !== 'string' ||
      !['M', 'F', 'other'].includes(body.gender)
    ) {
      issues.push("gender must be 'M', 'F', or 'other'")
    } else {
      result.gender = body.gender
    }
  }

  result.nationality = optionalString('nationality', body.nationality, issues, {
    maxLength: 64,
  })
  result.addressLine1 = optionalString(
    'addressLine1',
    body.addressLine1,
    issues,
    { maxLength: 200 }
  )
  result.addressLine2 = optionalString(
    'addressLine2',
    body.addressLine2,
    issues,
    { maxLength: 200 }
  )
  result.city = optionalString('city', body.city, issues, { maxLength: 100 })
  result.county = optionalString('county', body.county, issues, {
    maxLength: 100,
  })
  result.postalCode = optionalString('postalCode', body.postalCode, issues, {
    maxLength: 20,
  })
  result.phone = optionalString('phone', body.phone, issues, { maxLength: 50 })
  result.email = optionalEmail('email', body.email, issues)

  result.emergencyContactName = optionalString(
    'emergencyContactName',
    body.emergencyContactName,
    issues,
    { maxLength: 200 }
  )
  result.emergencyContactPhone = optionalString(
    'emergencyContactPhone',
    body.emergencyContactPhone,
    issues,
    { maxLength: 50 }
  )
  result.emergencyContactRelationship = optionalString(
    'emergencyContactRelationship',
    body.emergencyContactRelationship,
    issues,
    { maxLength: 100 }
  )

  result.bloodType = optionalString('bloodType', body.bloodType, issues, {
    maxLength: 8,
  })
  result.notes = optionalString('notes', body.notes, issues, {
    maxLength: 4000,
  })

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      result.isActive = body.isActive
    }
  }

  if (body.archive !== undefined) {
    if (typeof body.archive !== 'boolean') {
      issues.push('archive must be a boolean')
    } else {
      result.archive = body.archive
    }
  }

  if (body.unarchive !== undefined) {
    if (typeof body.unarchive !== 'boolean') {
      issues.push('unarchive must be a boolean')
    } else {
      result.unarchive = body.unarchive
    }
  }

  if (body.archivedReason !== undefined && body.archivedReason !== null) {
    if (
      typeof body.archivedReason !== 'string' ||
      !ARCHIVED_REASONS.includes(
        body.archivedReason as (typeof ARCHIVED_REASONS)[number]
      )
    ) {
      issues.push(`archivedReason must be one of: ${ARCHIVED_REASONS.join(', ')}`)
    } else {
      result.archivedReason =
        body.archivedReason as (typeof ARCHIVED_REASONS)[number]
    }
  }

  return result
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canViewSensitivePii,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseEmployeeInput } from '../route'
import {
  encryptCnp,
  decryptCnp,
  isCnpEncryptionConfigured,
} from '@/lib/crypto/cnp-cipher'
import { hashCnp } from '@/lib/crypto/cnp-hash'
import { validateCnp, cnpReasonToIssue, maskCnp } from '@/lib/crypto/cnp-validation'
import { getOrCreateTenantCnpSalt } from '@/lib/crypto/tenant-salt'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadEmployeeForActor(id: string, tenantId: string) {
  return prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
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

  const { id } = await ctx.params
  const employee = await loadEmployeeForActor(id, auth.user.tenantId)
  if (!employee) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // CNP exposure. For employees with idDocumentType='cnp':
  //   - everyone sees `cnpMasked` (e.g. "185031*******")
  //   - only practitioners / practice_admins see the decrypted `cnp` value
  // For employees with a non-CNP document type, both fields are null.
  let cnpPlaintext: string | null = null
  let cnpMasked: string | null = null
  if (employee.cnpEncrypted) {
    if (canViewSensitivePii(auth.user, auth.user.tenantId)) {
      try {
        cnpPlaintext = decryptCnp(employee.cnpEncrypted)
        cnpMasked = maskCnp(cnpPlaintext)
      } catch (err) {
        console.error('[employees.GET] CNP decryption failed', {
          employeeId: id,
          error: (err as Error).message,
        })
        // Don't leak the failure to the caller — present as masked-only.
        cnpMasked = '*************'
      }
    } else {
      // Assistant or similar — show only that *some* CNP is stored.
      cnpMasked = '*************'
    }
  }

  // Strip the raw encrypted blob and hash before returning; they're
  // internal storage details and adding them to the response would be
  // a needless leak surface.
  const { cnpEncrypted: _enc, cnpHash: _hash, ...safeFields } = employee
  return NextResponse.json({
    employee: {
      ...safeFields,
      cnp: cnpPlaintext,
      cnpMasked,
    },
  })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadEmployeeForActor(id, auth.user.tenantId)
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
  const data = parseEmployeeInput(body, issues, { isCreate: false })

  // Mutual exclusion: archive and unarchive can't both be true.
  if (data.archive && data.unarchive) {
    issues.push('archive and unarchive cannot both be true')
  }
  // Archiving requires a reason.
  if (data.archive && !data.archivedReason) {
    issues.push('archivedReason is required when archive=true')
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const clearableStringFields = [
    'idDocumentNumber',
    'companyEmployeeId',
    'gender',
    'nationality',
    'addressLine1',
    'addressLine2',
    'city',
    'county',
    'postalCode',
    'phone',
    'email',
    'emergencyContactName',
    'emergencyContactPhone',
    'emergencyContactRelationship',
    'bloodType',
    'notes',
  ] as const

  const updateData: Record<string, unknown> = {}

  if (data.firstName !== undefined) updateData.firstName = data.firstName
  if (data.lastName !== undefined) updateData.lastName = data.lastName
  if (data.idDocumentType !== undefined)
    updateData.idDocumentType = data.idDocumentType
  if (data.birthDate !== undefined) updateData.birthDate = data.birthDate
  if ('birthDate' in body && (body.birthDate === null || body.birthDate === '')) {
    updateData.birthDate = null
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

  // CNP-change handling. Three cases:
  //
  //   (1) Switching FROM cnp TO non-cnp: clear cnpEncrypted + cnpHash;
  //       store the new idDocumentNumber plaintext if provided.
  //   (2) Switching FROM non-cnp TO cnp: idDocumentNumber must be provided,
  //       validate it, dup-check, encrypt + hash.
  //   (3) Staying on cnp with a new idDocumentNumber: re-validate, dup-check
  //       excluding self, re-encrypt + re-hash.
  //   (4) No relevant change: leave CNP fields untouched.
  //
  // Detection: the resolved `idDocumentType` (after PATCH) is either
  // explicitly set in this request OR taken from the existing record.
  const incomingType =
    data.idDocumentType ?? existing.idDocumentType
  const wasCnp = existing.idDocumentType === 'cnp'
  const wantsCnp = incomingType === 'cnp'
  const idNumberProvided =
    'idDocumentNumber' in body &&
    body.idDocumentNumber !== null &&
    body.idDocumentNumber !== '' &&
    typeof body.idDocumentNumber === 'string'

  if (wasCnp && !wantsCnp) {
    // Case 1: clear encrypted fields. The plaintext idDocumentNumber may
    // be set by the loop above (for the new doc type) or left null.
    updateData.cnpEncrypted = null
    updateData.cnpHash = null
  } else if (wantsCnp && (idNumberProvided || !wasCnp)) {
    // Case 2 or 3: take CNP value, validate, encrypt, dup-check.
    if (!idNumberProvided) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          issues: ['idDocumentNumber is required when switching to CNP'],
        },
        { status: 400 }
      )
    }
    if (!isCnpEncryptionConfigured()) {
      return NextResponse.json(
        { error: 'encryption_not_configured' },
        { status: 503 }
      )
    }
    const cnp = (body.idDocumentNumber as string).trim()
    const validation = validateCnp(cnp)
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          issues: [cnpReasonToIssue(validation.reason!)],
        },
        { status: 400 }
      )
    }

    let salt: string
    try {
      salt = await getOrCreateTenantCnpSalt(auth.user.tenantId)
    } catch (err) {
      console.error('[employees.PATCH] tenant salt resolution failed', err)
      return NextResponse.json(
        { error: 'encryption_not_configured' },
        { status: 503 }
      )
    }
    const newHash = hashCnp(cnp, salt)

    // Dup check excludes the current employee — re-saving the same CNP
    // on the same row is fine.
    const duplicate = await prisma.employee.findFirst({
      where: {
        tenantId: auth.user.tenantId,
        cnpHash: newHash,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true, firstName: true, lastName: true },
    })
    if (duplicate) {
      return NextResponse.json(
        {
          error: 'duplicate_cnp',
          message: 'Another employee with this CNP already exists in this cabinet.',
          duplicateEmployee: {
            id: duplicate.id,
            firstName: duplicate.firstName,
            lastName: duplicate.lastName,
          },
        },
        { status: 409 }
      )
    }

    updateData.cnpEncrypted = encryptCnp(cnp)
    updateData.cnpHash = newHash
    // The plaintext idDocumentNumber field is wiped — CNP lives in
    // cnpEncrypted now.
    updateData.idDocumentNumber = null
  }
  // Case 4 falls through with no changes to CNP fields.

  if (data.archive) {
    updateData.archivedAt = new Date()
    updateData.archivedReason = data.archivedReason
    updateData.isActive = false
  } else if (data.unarchive) {
    updateData.archivedAt = null
    updateData.archivedReason = null
    if (updateData.isActive === undefined) updateData.isActive = true
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ employee: existing })
  }

  // Archive transitions also auto-end any open workplace assignment.
  // Unarchive does NOT auto-restore the assignment — once ended, only an
  // explicit re-assignment can re-open the link. This is intentional:
  // re-employing someone may put them in a different workplace.
  const operations = []
  operations.push(
    prisma.employee.update({
      where: { id },
      data: updateData,
    })
  )
  if (data.archive) {
    operations.push(
      prisma.employeeWorkplaceAssignment.updateMany({
        where: {
          employeeId: id,
          tenantId: auth.user.tenantId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          endDate: new Date(),
        },
      })
    )
  }

  const [employee] = await prisma.$transaction(operations)

  return NextResponse.json({ employee })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadEmployeeForActor(id, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Soft delete also closes any open workplace assignments — leaving
  // open assignments pointing at a deleted employee would lie in
  // workplace headcount queries.
  await prisma.$transaction([
    prisma.employeeWorkplaceAssignment.updateMany({
      where: {
        employeeId: id,
        tenantId: auth.user.tenantId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
        endDate: new Date(),
      },
    }),
    prisma.employee.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}

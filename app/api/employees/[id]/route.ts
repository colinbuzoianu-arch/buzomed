import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseEmployeeInput } from '../route'

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
  return NextResponse.json({ employee })
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

  // Build the update object explicitly so we never write a column the
  // client didn't ask us to. The clearable string set mirrors what's
  // editable on the form; missing keys leave existing values intact,
  // null/empty keys clear the column.
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

  // Archive / unarchive are explicit transitions, not generic field writes.
  // We separate them from the field loop because they touch two columns
  // (archivedAt + archivedReason) atomically and have business semantics
  // beyond a simple value set.
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

  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
  })

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

  // Soft delete. For employees this is distinct from archiving:
  //   - archive = "no longer at this employer" — keeps medical history
  //     queryable, the row is intentionally still there for examinations.
  //   - delete  = "this row was a mistake / GDPR erasure request" — the
  //     row is hidden from all reads via deletedAt = not null.
  // The audit trail for deletes is not yet wired up (TODO in handoff).
  await prisma.employee.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  return NextResponse.json({ ok: true })
}

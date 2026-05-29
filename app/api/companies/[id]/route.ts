import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseCompanyInput } from '../route'

/**
 * Per-company endpoint:
 *
 *   GET    /api/companies/[id]   read
 *   PATCH  /api/companies/[id]   update (write role required)
 *   DELETE /api/companies/[id]   soft-delete (write role required)
 *
 * Tenant scoping for all three is "the row's tenantId must equal the
 * authenticated user's tenantId". If a 404 would leak existence to a
 * cross-tenant probe we don't care: companies are not secret PHI, and
 * collapsing 403/404 to a single 404 keeps the API simple.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(id: string, tenantId: string) {
  return prisma.company.findFirst({
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
  const company = await loadCompanyForActor(id, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ company })
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

  const { id } = await ctx.params
  const existing = await loadCompanyForActor(id, auth.user.tenantId)
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
  const data = parseCompanyInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  // PATCH semantics: only fields that were explicitly provided in the
  // request body get written. Fields the parser turned into `undefined`
  // because the client didn't send them are skipped here.
  //
  // For nullable string columns we want clients to be able to clear them
  // by sending an empty string. The parser normalizes "" → undefined,
  // which would conflict with that intent — so for clearable string
  // fields we look at the raw body to distinguish "absent" from "empty".
  const clearableStringFields = [
    'cui',
    'registrationNumber',
    'caenCode',
    'addressLine1',
    'addressLine2',
    'city',
    'county',
    'postalCode',
    'phone',
    'email',
    'website',
    'contactPersonName',
    'contactPersonRole',
    'contactPersonPhone',
    'contactPersonEmail',
    'recallNotificationEmail',
    'notes',
  ] as const

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.contractStartDate !== undefined)
    updateData.contractStartDate = data.contractStartDate
  if (data.contractEndDate !== undefined)
    updateData.contractEndDate = data.contractEndDate
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

  // Date clears: client sends '' or null to drop the date.
  for (const field of ['contractStartDate', 'contractEndDate'] as const) {
    if (field in body && (body[field] === null || body[field] === '')) {
      updateData[field] = null
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ company: existing })
  }

  // Clear the import badge the first time a doctor manually edits the company
  updateData.createdFromImport = false

  const company = await prisma.company.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ company })
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

  const { id } = await ctx.params
  const existing = await loadCompanyForActor(id, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Soft delete: set deletedAt and flip isActive off so list queries
  // exclude it without checking deletedAt explicitly. The audit trail
  // for "who deleted this" lives in audit_log_entries — that subsystem
  // is not yet wired up (TODO in handoff), so we don't write to it here.
  await prisma.company.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  return NextResponse.json({ ok: true })
}

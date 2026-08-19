import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'
import { parseIntermediaryInput } from '../route'

/**
 * Per-intermediary endpoint:
 *
 *   GET    /api/intermediaries/[id]   read
 *   PATCH  /api/intermediaries/[id]   update (write role required)
 *   DELETE /api/intermediaries/[id]   soft-delete (write role required,
 *                                     refused while companies are linked)
 *
 * Mirrors app/api/companies/[id]/route.ts.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadIntermediaryForActor(id: string, tenantId: string) {
  return prisma.intermediary.findFirst({
    where: { id, tenantId, deletedAt: null },
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

  const { id } = await ctx.params
  const intermediary = await loadIntermediaryForActor(id, auth.user.tenantId)
  if (!intermediary) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ intermediary })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadIntermediaryForActor(id, auth.user.tenantId)
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
  const data = parseIntermediaryInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  // PATCH semantics: only fields explicitly provided in the request body
  // get written; empty string clears a nullable string column. See the
  // matching comment in app/api/companies/[id]/route.ts.
  const clearableStringFields = [
    'cui',
    'nrRegCom',
    'address',
    'city',
    'county',
    'iban',
    'bank',
    'contactPersonName',
    'contactPersonEmail',
    'contactPersonPhone',
    'notes',
  ] as const

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
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
    return NextResponse.json({ intermediary: existing })
  }

  const intermediary = await prisma.intermediary.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ intermediary })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadIntermediaryForActor(id, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const linkedCompanyCount = await prisma.company.count({
    where: { intermediaryId: id, deletedAt: null },
  })
  if (linkedCompanyCount > 0) {
    return NextResponse.json(
      {
        error: 'has_linked_companies',
        message: `Intermediarul nu poate fi șters — are ${linkedCompanyCount} firme asociate. Dezasociați firmele întâi.`,
      },
      { status: 400 }
    )
  }

  await prisma.intermediary.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  return NextResponse.json({ ok: true })
}

import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'
import { parseCompanyContactInput } from '../parse'

interface RouteContext {
  params: Promise<{ id: string; contactId: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  })
}

async function loadContact(contactId: string, companyId: string) {
  return prisma.companyContact.findFirst({
    where: { id: contactId, companyId },
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

  const { id: companyId, contactId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const contact = await loadContact(contactId, companyId)
  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ contact })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, contactId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const existing = await loadContact(contactId, companyId)
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

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
  const data = parseCompanyContactInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const clearableStringFields = ['roleNote', 'phone', 'email', 'notes'] as const
  const updateData: Record<string, unknown> = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.role !== undefined) updateData.role = data.role
  if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary

  for (const field of clearableStringFields) {
    if (!(field in body)) continue
    const incoming = body[field]
    if (incoming === null || incoming === '') {
      updateData[field] = null
    } else if (data[field] !== undefined) {
      updateData[field] = data[field]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ contact: existing })
  }

  const contact = await prisma.$transaction(async (tx) => {
    // If setting isPrimary=true, demote other primary contacts first.
    if (updateData.isPrimary === true) {
      await tx.companyContact.updateMany({
        where: { companyId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      })
    }
    return tx.companyContact.update({
      where: { id: contactId },
      data: updateData,
    })
  })

  return NextResponse.json({ contact })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, contactId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const existing = await loadContact(contactId, companyId)
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Prevent deletion if this is the only primary contact.
  if (existing.isPrimary) {
    const primaryCount = await prisma.companyContact.count({
      where: { companyId, isPrimary: true },
    })
    if (primaryCount <= 1) {
      return NextResponse.json(
        {
          error: 'last_primary_contact',
          message: 'Compania trebuie să aibă cel puțin un contact principal',
        },
        { status: 400 }
      )
    }
  }

  await prisma.companyContact.delete({ where: { id: contactId } })

  return NextResponse.json({ ok: true })
}

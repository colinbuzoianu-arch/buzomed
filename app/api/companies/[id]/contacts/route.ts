import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'
import { parseCompanyContactInput } from './parse'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
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

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const contacts = await prisma.companyContact.findMany({
    where: { companyId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ contacts })
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
  const data = parseCompanyContactInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  // If this contact is being created as primary, demote all existing primary contacts.
  const { name, role } = data
  if (!name || !role) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['name and role are required'] },
      { status: 400 }
    )
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.companyContact.updateMany({
        where: { companyId, isPrimary: true },
        data: { isPrimary: false },
      })
    }
    return tx.companyContact.create({
      data: {
        companyId,
        name,
        role,
        roleNote: data.roleNote,
        phone: data.phone,
        email: data.email,
        isPrimary: data.isPrimary ?? false,
        notes: data.notes,
      },
    })
  })

  return NextResponse.json({ contact }, { status: 201 })
}

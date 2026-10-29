import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import { parseWorkSiteInput } from '../route'

interface RouteContext {
  params: Promise<{ id: string; siteId: string }>
}

async function loadSiteForActor(companyId: string, siteId: string, tenantId: string) {
  return prisma.workSite.findFirst({
    where: { id: siteId, companyId, tenantId, deletedAt: null },
  })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, siteId } = await ctx.params
  const existing = await loadSiteForActor(companyId, siteId, auth.user.tenantId)
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
  const data = parseWorkSiteInput(body, issues, { isCreate: false })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.isActive !== undefined) updateData.isActive = data.isActive
  // address/city/county are clearable: an empty string blanks them.
  for (const field of ['addressLine1', 'city', 'county'] as const) {
    if (!(field in body)) continue
    const incoming = body[field]
    if (incoming === null || incoming === '') updateData[field] = null
    else if (data[field] !== undefined) updateData[field] = data[field]
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ workSite: existing })
  }

  let workSite: Awaited<ReturnType<typeof prisma.workSite.update>>
  try {
    workSite = await prisma.workSite.update({ where: { id: siteId }, data: updateData })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'conflict', message: 'A work site with this name already exists in this company.' },
        { status: 409 }
      )
    }
    throw err
  }

  return NextResponse.json({ workSite })
}

/**
 * Soft-delete a punct de lucru. Refused (409) when any non-deleted workplace
 * still references it — a site is never hard-deleted out from under its
 * workplaces (spec §3: "never hard-delete if referenced"). To retire a site
 * that is in use, deactivate it instead (PATCH isActive=false).
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId, siteId } = await ctx.params
  const existing = await loadSiteForActor(companyId, siteId, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const referencing = await prisma.workplace.count({
    where: { workSiteId: siteId, tenantId: auth.user.tenantId, deletedAt: null },
  })
  if (referencing > 0) {
    return NextResponse.json(
      { error: 'in_use', message: 'This site still has workplaces. Deactivate it instead.', referencing },
      { status: 409 }
    )
  }

  await prisma.workSite.update({
    where: { id: siteId },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ ok: true })
}

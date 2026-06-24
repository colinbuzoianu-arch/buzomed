import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { asObject, optionalString, optionalDate } from '@/lib/validation'

interface Ctx { params: Promise<{ id: string }> }

async function requireSuperAdmin() {
  const auth = await getApiUser()
  if (!auth.user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!auth.user.roles.includes('super_admin')) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: auth.user }
}

async function loadInvoice(id: string) {
  return prisma.platformInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      tenant: { select: { id: true, name: true, cui: true, addressLine1: true, city: true, email: true, subscriptionTier: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const check = await requireSuperAdmin()
  if ('error' in check) return check.error
  const { id } = await ctx.params
  const invoice = await loadInvoice(id)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ invoice })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const check = await requireSuperAdmin()
  if ('error' in check) return check.error
  const { id } = await ctx.params
  const invoice = await loadInvoice(id)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (invoice.status !== 'draft') return NextResponse.json({ error: 'only_drafts_editable' }, { status: 409 })

  const body = asObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const issues: string[] = []
  const notes = optionalString('notes', body.notes, issues)
  const dueDate = optionalDate('dueDate', body.dueDate, issues)

  const updated = await prisma.platformInvoice.update({
    where: { id },
    data: {
      notes: notes ?? null,
      dueDate: dueDate ?? null,
    },
  })
  return NextResponse.json({ invoice: updated })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const check = await requireSuperAdmin()
  if ('error' in check) return check.error
  const { id } = await ctx.params
  const invoice = await loadInvoice(id)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (invoice.status !== 'draft') return NextResponse.json({ error: 'only_drafts_deletable' }, { status: 409 })
  await prisma.platformInvoice.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}

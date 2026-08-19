import { Prisma } from '@prisma/client'
import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { computeTotals, parseInvoiceInput, VAT_EXEMPT_REASON } from '@/lib/invoices/parse'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'

interface RouteContext {
  params: Promise<{ id: string; iid: string }>
}

async function loadInvoice(iid: string, intermediaryId: string, tenantId: string) {
  return prisma.invoice.findFirst({
    where: { id: iid, intermediaryId, tenantId, deletedAt: null },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

async function loadLinkedCompanyIds(intermediaryId: string, tenantId: string) {
  const companies = await prisma.company.findMany({
    where: { intermediaryId, tenantId, deletedAt: null },
    select: { id: true },
  })
  return new Set(companies.map((c) => c.id))
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: intermediaryId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, intermediaryId, auth.user.tenantId)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ invoice })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: intermediaryId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, intermediaryId, auth.user.tenantId)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (invoice.status !== 'draft')
    return NextResponse.json(
      { error: 'not_editable', message: 'Only draft invoices can be edited.' },
      { status: 409 }
    )

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const issues: string[] = []
  const data = parseInvoiceInput(body, issues)
  if (data.items.length === 0) issues.push('At least one item is required')

  const tenantId = auth.user.tenantId
  const linkedCompanyIds = await loadLinkedCompanyIds(intermediaryId, tenantId)
  for (const [i, item] of data.items.entries()) {
    if (item.companyId && !linkedCompanyIds.has(item.companyId)) {
      issues.push(`items[${i}]: companyId is not a company linked to this intermediary`)
    }
  }

  if (issues.length > 0)
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })

  const vatRate = data.vatRate ?? Number(invoice.vatRate)
  const totals = computeTotals(data.items, vatRate)

  const updated = await prisma.$transaction(async (tx) => {
    // Replace all items
    await tx.invoiceItem.deleteMany({ where: { invoiceId: iid } })
    return tx.invoice.update({
      where: { id: iid },
      data: {
        subtotal: new Prisma.Decimal(totals.subtotal),
        vatRate: new Prisma.Decimal(vatRate),
        vatAmount: new Prisma.Decimal(totals.vatAmount),
        total: new Prisma.Decimal(totals.total),
        currency: data.currency ?? invoice.currency,
        vatExemptReason: vatRate === 0 ? VAT_EXEMPT_REASON : null,
        dueDate: data.dueDate,
        notes: data.notes,
        items: {
          create: data.items.map((item, i) => ({
            tenant: { connect: { id: tenantId } },
            ...(item.companyId ? { company: { connect: { id: item.companyId } } } : {}),
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            lineTotal: new Prisma.Decimal(Math.round(item.quantity * item.unitPrice * 100) / 100),
            sortOrder: i,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
  })

  return NextResponse.json({ invoice: updated })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: intermediaryId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, intermediaryId, auth.user.tenantId)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (invoice.status !== 'draft')
    return NextResponse.json(
      { error: 'not_deletable', message: 'Only draft invoices can be deleted.' },
      { status: 409 }
    )

  await prisma.invoice.update({
    where: { id: iid },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

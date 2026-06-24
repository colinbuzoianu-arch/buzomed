import { type NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject } from '@/lib/validation'
import {
  parseInvoiceInput,
  computeTotals,
} from '../route'

const VAT_EXEMPT_REASON =
  'Scutit de TVA conform Art. 292 alin. (1) lit. a) pct. 1 din Codul Fiscal'

interface RouteContext {
  params: Promise<{ id: string; iid: string }>
}

async function loadInvoice(iid: string, companyId: string, tenantId: string) {
  return prisma.invoice.findFirst({
    where: { id: iid, companyId, tenantId, deletedAt: null },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: companyId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, companyId, auth.user.tenantId)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ invoice })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: companyId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, companyId, auth.user.tenantId)
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (invoice.status !== 'draft')
    return NextResponse.json(
      { error: 'not_editable', message: 'Only draft invoices can be edited.' },
      { status: 409 }
    )

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const issues: string[] = []
  const data = parseInvoiceInput(body, issues)
  if (data.items.length === 0) issues.push('At least one item is required')
  if (issues.length > 0)
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })

  const tenantId = auth.user.tenantId
  const vatRate = data.vatRate ?? Number(invoice.vatRate)
  const totals = computeTotals(data.items, vatRate)

  const updated = await prisma.$transaction(async (tx) => {
    // Replace all items
    await tx.invoiceItem.deleteMany({ where: { invoiceId: iid } })
    return tx.invoice.update({
      where: { id: iid },
      data: {
        ...(data.contractId !== undefined
          ? data.contractId
            ? { contract: { connect: { id: data.contractId } } }
            : { contract: { disconnect: true } }
          : {}),
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
            description: item.description,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            lineTotal: new Prisma.Decimal(
              Math.round(item.quantity * item.unitPrice * 100) / 100
            ),
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

  const { id: companyId, iid } = await ctx.params
  const invoice = await loadInvoice(iid, companyId, auth.user.tenantId)
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

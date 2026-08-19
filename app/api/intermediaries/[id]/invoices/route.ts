import { Prisma } from '@prisma/client'
import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { createInvoiceWithNumber } from '@/lib/invoices/numbering'
import { computeTotals, parseInvoiceInput, VAT_EXEMPT_REASON } from '@/lib/invoices/parse'
import { canReadTenantData, canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { asObject } from '@/lib/validation'

/**
 * Invoices addressed to an Intermediary (MedLife, Regina Maria, etc.)
 * instead of directly to a Company. Mirrors
 * app/api/companies/[id]/invoices/route.ts, with two differences:
 *   - the invoice connects to `intermediary`, not `company`
 *   - each line item may carry a `companyId`, validated against the set of
 *     companies actually linked to this intermediary, so the intermediary
 *     can reconcile which employer each line belongs to
 *
 * Invoice numbering is shared with company invoices — both go through
 * createInvoiceWithNumber, which allocates the next sequence per tenant
 * regardless of recipient type.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadIntermediary(intermediaryId: string, tenantId: string) {
  return prisma.intermediary.findFirst({
    where: { id: intermediaryId, tenantId, deletedAt: null },
    select: { id: true },
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

  const { id: intermediaryId } = await ctx.params
  if (!(await loadIntermediary(intermediaryId, auth.user.tenantId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: auth.user.tenantId, intermediaryId, deletedAt: null },
    orderBy: [{ invoiceYear: 'desc' }, { invoiceSequence: 'desc' }],
    include: { _count: { select: { items: true } } },
  })

  return NextResponse.json({ invoices })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: intermediaryId } = await ctx.params
  if (!(await loadIntermediary(intermediaryId, auth.user.tenantId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

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

  const totals = computeTotals(data.items, data.vatRate ?? 0)

  const invoice = await createInvoiceWithNumber(
    tenantId,
    (n) => ({
      tenant: { connect: { id: tenantId } },
      intermediary: { connect: { id: intermediaryId } },
      invoiceNumber: n.number,
      invoiceYear: n.year,
      invoiceSequence: n.sequence,
      subtotal: new Prisma.Decimal(totals.subtotal),
      vatRate: new Prisma.Decimal(data.vatRate ?? 0),
      vatAmount: new Prisma.Decimal(totals.vatAmount),
      total: new Prisma.Decimal(totals.total),
      currency: data.currency ?? 'RON',
      vatExemptReason: (data.vatRate ?? 0) === 0 ? VAT_EXEMPT_REASON : null,
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
    }),
    (created) => created
  )

  return NextResponse.json({ invoice }, { status: 201 })
}

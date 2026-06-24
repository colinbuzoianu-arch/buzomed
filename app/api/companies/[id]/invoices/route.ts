import { type NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject, optionalDate, optionalString } from '@/lib/validation'
import { createInvoiceWithNumber } from '@/lib/invoices/numbering'

interface RouteContext {
  params: Promise<{ id: string }>
}

const VAT_EXEMPT_REASON =
  'Scutit de TVA conform Art. 292 alin. (1) lit. a) pct. 1 din Codul Fiscal'

async function loadCompany(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  })
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: companyId } = await ctx.params
  if (!(await loadCompany(companyId, auth.user.tenantId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: auth.user.tenantId, companyId, deletedAt: null },
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

  const { id: companyId } = await ctx.params
  if (!(await loadCompany(companyId, auth.user.tenantId)))
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

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
  const totals = computeTotals(data.items, data.vatRate ?? 0)

  const invoice = await createInvoiceWithNumber(
    tenantId,
    (n) => ({
      tenant: { connect: { id: tenantId } },
      company: { connect: { id: companyId } },
      ...(data.contractId ? { contract: { connect: { id: data.contractId } } } : {}),
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
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.unitPrice),
          lineTotal: new Prisma.Decimal(
            Math.round(item.quantity * item.unitPrice * 100) / 100
          ),
          sortOrder: i,
        })),
      },
    }),
    (created) => created
  )

  return NextResponse.json({ invoice }, { status: 201 })
}

// ─── shared input parsing ────────────────────────────────────────────

export interface ParsedItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface ParsedInvoiceInput {
  contractId?: string
  vatRate?: number
  dueDate?: Date
  currency?: string
  notes?: string
  items: ParsedItem[]
}

export function parseInvoiceInput(
  body: Record<string, unknown>,
  issues: string[]
): ParsedInvoiceInput {
  const result: ParsedInvoiceInput = { items: [] }

  if (body.contractId != null) {
    if (typeof body.contractId !== 'string') issues.push('contractId must be a string')
    else result.contractId = body.contractId
  }

  if (body.vatRate !== undefined && body.vatRate !== null) {
    const v = body.vatRate
    if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 1)
      issues.push('vatRate must be a number between 0 and 1')
    else result.vatRate = v
  }

  result.dueDate = optionalDate('dueDate', body.dueDate, issues)
  result.currency = optionalString('currency', body.currency, issues, { maxLength: 3 }) ?? 'RON'
  result.notes = optionalString('notes', body.notes, issues, { maxLength: 4000 })

  if (!Array.isArray(body.items)) {
    issues.push('items must be an array')
  } else {
    result.items = (body.items as unknown[]).flatMap((raw, idx) => {
      if (typeof raw !== 'object' || raw === null) {
        issues.push(`items[${idx}]: must be an object`)
        return []
      }
      const item = raw as Record<string, unknown>
      const desc = typeof item.description === 'string' ? item.description.trim() : ''
      const qty = typeof item.quantity === 'number' ? item.quantity : NaN
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : NaN
      const itemIssues: string[] = []
      if (!desc) itemIssues.push('description is required')
      if (isNaN(qty) || qty <= 0) itemIssues.push('quantity must be > 0')
      if (isNaN(price) || price < 0) itemIssues.push('unitPrice must be >= 0')
      if (itemIssues.length > 0) {
        issues.push(`items[${idx}]: ${itemIssues.join(', ')}`)
        return []
      }
      return [{ description: desc, quantity: qty, unitPrice: price }]
    })
  }

  return result
}

export function computeTotals(
  items: ParsedItem[],
  vatRate: number
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = items.reduce((sum, i) => {
    return sum + Math.round(i.quantity * i.unitPrice * 100) / 100
  }, 0)
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100
  const total = Math.round((subtotal + vatAmount) * 100) / 100
  return { subtotal, vatAmount, total }
}

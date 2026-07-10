import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { asObject, optionalString, optionalDate } from '@/lib/validation'
import { createPlatformInvoiceForTenant } from '@/lib/platform/invoice-numbering'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

async function requireSuperAdmin(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!auth.user.roles.includes('super_admin')) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: auth.user }
}

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')
  const status = searchParams.get('status')

  const isSuperAdmin = auth.user.roles.includes('super_admin')
  const isOwnTenantAdmin =
    auth.user.roles.includes('practice_admin') && !!tenantId && auth.user.tenantId === tenantId
  if (!isSuperAdmin && !isOwnTenantAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const invoices = await prisma.platformInvoice.findMany({
    where: {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: [{ invoiceYear: 'desc' }, { invoiceSequence: 'desc' }],
    include: {
      tenant: { select: { id: true, name: true, email: true, subscriptionTier: true } },
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json({ invoices })
}

export async function POST(request: NextRequest) {
  const check = await requireSuperAdmin(request)
  if ('error' in check) return check.error

  const raw = await request.json().catch(() => null)
  const body = asObject(raw)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : null
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true, addressLine1: true, city: true, email: true },
  })
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return NextResponse.json({ error: 'items required' }, { status: 400 })

  type RawItem = { description?: unknown; quantity?: unknown; unitPrice?: unknown; lineTotal?: unknown }
  const items = rawItems as RawItem[]

  const toFinite = (v: unknown, fallback = 0): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  const issues: string[] = []
  const notes = optionalString('notes', body.notes, issues)
  const dueDate = optionalDate('dueDate', body.dueDate, issues)

  const invoice = await createPlatformInvoiceForTenant({
    tenant,
    vatRate: toFinite(body.vatRate),
    notes: notes ?? null,
    dueDate: dueDate ?? null,
    items: items.map((item) => ({
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      unitPrice: Number(item.unitPrice ?? 0),
      lineTotal: toFinite(item.lineTotal),
    })),
  })

  const { ipAddress, userAgent } = getRequestMeta(request)
  void writeAuditLog({
    tenantId: null,
    userId: check.user.id,
    action: 'create',
    entityType: 'platform_invoice',
    entityId: invoice.id,
    entitySummary: `${invoice.invoiceNumber} — ${tenant.name}`,
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ invoice }, { status: 201 })
}

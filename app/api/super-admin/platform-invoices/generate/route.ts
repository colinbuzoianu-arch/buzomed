import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { asObject } from '@/lib/validation'
import { createPlatformInvoiceForTenant } from '@/lib/platform/invoice-numbering'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

async function requireSuperAdmin() {
  const auth = await getApiUser()
  if (!auth.user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!auth.user.roles.includes('super_admin')) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { user: auth.user }
}

export async function POST(request: NextRequest) {
  const check = await requireSuperAdmin()
  if ('error' in check) return check.error

  const raw = await request.json().catch(() => null)
  const body = asObject(raw)
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : null
  const year = typeof body.year === 'number' ? body.year : null
  const month = typeof body.month === 'number' ? body.month : null
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'invalid_period' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true, addressLine1: true, city: true, email: true },
  })
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 })

  const sub = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })
  if (!sub) return NextResponse.json({ error: 'no_subscription' }, { status: 404 })

  const periodStart = new Date(Date.UTC(year, month - 1, 1))
  const periodEnd = new Date(Date.UTC(year, month, 1))
  const billingPeriod = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = `${String(month).padStart(2, '0')}/${year}`

  const existing = await prisma.platformInvoice.findFirst({
    where: { tenantId, billingPeriod, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'already_generated', message: `O factură pentru ${MONTHS_RO[month - 1]} ${year} există deja (${existing.invoiceNumber}).` },
      { status: 409 }
    )
  }

  let items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[]

  if (sub.billingMode === 'usage') {
    if (sub.platformPricePerExam === null) {
      return NextResponse.json({ error: 'billing_mode_misconfigured' }, { status: 400 })
    }
    const count = await prisma.examination.count({
      where: { tenantId, status: 'completed', completedAt: { gte: periodStart, lt: periodEnd } },
    })
    const unitPrice = Number(sub.platformPricePerExam)
    items = [
      {
        description: `Consultații Buzomed — ${count} examinări — ${monthLabel}`,
        quantity: count,
        unitPrice,
        lineTotal: count * unitPrice,
      },
    ]
  } else {
    const plan = await prisma.plan.findFirst({ where: { tier: sub.tier } })
    if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 400 })
    const unitPrice = Number(plan.monthlyPrice)
    items = [
      {
        description: `Abonament Buzomed — ${sub.tier} — ${monthLabel}`,
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
      },
    ]
  }

  const invoice = await createPlatformInvoiceForTenant({
    tenant,
    items,
    vatRate: 0,
    billingPeriod,
  })

  const { ipAddress, userAgent } = getRequestMeta(request)
  void writeAuditLog({
    tenantId: null,
    userId: check.user.id,
    action: 'create',
    entityType: 'platform_invoice',
    entityId: invoice.id,
    entitySummary: `${invoice.invoiceNumber} — ${tenant.name} (${billingPeriod})`,
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ invoice }, { status: 201 })
}

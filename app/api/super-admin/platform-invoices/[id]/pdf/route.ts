import { type NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { PlatformInvoicePdfDocument } from './platform-invoice-pdf-document'
import type { PlatformInvoicePdfData } from './platform-invoice-pdf-document'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('super_admin')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      tenant: { select: { name: true, cui: true, addressLine1: true, city: true, email: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const data: PlatformInvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    subtotal: invoice.subtotal.toString(),
    vatRate: invoice.vatRate.toString(),
    vatAmount: invoice.vatAmount.toString(),
    total: invoice.total.toString(),
    currency: invoice.currency,
    vatExemptReason: invoice.vatExemptReason,
    notes: invoice.notes,
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
    tenant: {
      name: invoice.snapshotTenantName ?? invoice.tenant.name,
      cui: invoice.snapshotTenantCui ?? invoice.tenant.cui ?? null,
      address: invoice.snapshotTenantAddress ??
        ([invoice.tenant.addressLine1, invoice.tenant.city].filter(Boolean).join(', ') || null),
      email: invoice.snapshotTenantEmail ?? invoice.tenant.email ?? null,
    },
  }

  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(PlatformInvoicePdfDocument, { data }) as any)
  } catch (err) {
    console.error('[platform-invoice-pdf] render failed', err)
    return NextResponse.json({ error: 'pdf_render_failed', message: String(err) }, { status: 500 })
  }

  const filename = `factura_${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

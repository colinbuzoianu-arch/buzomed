import { renderToBuffer } from '@react-pdf/renderer'
import { type NextRequest, NextResponse } from 'next/server'
import { createElement } from 'react'
import type { InvoicePdfData } from '@/app/api/companies/[id]/invoices/[iid]/pdf/invoice-pdf-document'
import { InvoicePdfDocument } from '@/app/api/companies/[id]/invoices/[iid]/pdf/invoice-pdf-document'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

interface RouteContext {
  params: Promise<{ id: string; iid: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: intermediaryId, iid } = await ctx.params

  const invoice = await prisma.invoice.findFirst({
    where: { id: iid, intermediaryId, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      intermediary: {
        select: {
          name: true,
          cui: true,
          address: true,
          city: true,
          county: true,
          contactPersonName: true,
          contactPersonEmail: true,
        },
      },
      tenant: {
        select: {
          name: true,
          cui: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
          phone: true,
          email: true,
        },
      },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { company: { select: { name: true } } },
      },
    },
  })

  if (!invoice?.intermediary)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const buildAddress = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(', ') || null

  const data: InvoicePdfData = {
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
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
      companyName: item.company?.name ?? null,
    })),
    tenant: {
      name: invoice.tenant.name,
      cui: invoice.tenant.cui ?? null,
      address: buildAddress(
        invoice.tenant.addressLine1,
        invoice.tenant.addressLine2,
        invoice.tenant.city,
        invoice.tenant.county
      ),
      phone: invoice.tenant.phone ?? null,
      email: invoice.tenant.email ?? null,
    },
    billedParty: {
      name: invoice.intermediary.name,
      cui: invoice.intermediary.cui ?? null,
      address: buildAddress(invoice.intermediary.address, invoice.intermediary.county),
      city: invoice.intermediary.city ?? null,
      contactPersonName: invoice.intermediary.contactPersonName ?? null,
      contactPersonEmail: invoice.intermediary.contactPersonEmail ?? null,
    },
  }

  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(InvoicePdfDocument, { data }) as any)
  } catch (err) {
    console.error('[invoice-pdf] render failed', err)
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

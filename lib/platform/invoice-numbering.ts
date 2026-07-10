import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface NextPlatformInvoiceNumberResult {
  year: number
  sequence: number
  number: string
}

export async function computeNextPlatformInvoiceNumber(
  year: number = new Date().getUTCFullYear()
): Promise<NextPlatformInvoiceNumberResult> {
  const highest = await prisma.platformInvoice.findFirst({
    where: { invoiceYear: year, deletedAt: null },
    orderBy: { invoiceSequence: 'desc' },
    select: { invoiceSequence: true },
  })

  const sequence = (highest?.invoiceSequence ?? 0) + 1
  return {
    year,
    sequence,
    number: `VS-${year}/${String(sequence).padStart(3, '0')}`,
  }
}

const MAX_RETRIES = 5

export async function createPlatformInvoiceWithNumber<T>(
  buildData: (n: NextPlatformInvoiceNumberResult) => Prisma.PlatformInvoiceCreateInput,
  toReturn: (created: Awaited<ReturnType<typeof prisma.platformInvoice.create>>) => T
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const next = await computeNextPlatformInvoiceNumber()
    try {
      const created = await prisma.platformInvoice.create({ data: buildData(next) })
      return toReturn(created)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_RETRIES - 1
      ) {
        continue
      }
      throw err
    }
  }
  throw new Error('Failed to generate unique platform invoice number after max retries')
}

export const PLATFORM_INVOICE_VAT_EXEMPT_REASON =
  'Scutit de TVA conform Art. 292 alin. (1) lit. a) pct. 1 din Codul Fiscal (servicii software medical)'

export interface PlatformInvoiceLineItemInput {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface PlatformInvoiceTenantSnapshotInput {
  id: string
  name: string
  cui: string | null
  addressLine1: string | null
  city: string | null
  email: string | null
}

export interface CreatePlatformInvoiceForTenantParams {
  tenant: PlatformInvoiceTenantSnapshotInput
  items: PlatformInvoiceLineItemInput[]
  vatRate?: number
  notes?: string | null
  dueDate?: Date | null
  billingPeriod?: string | null
}

// Shared invoice-creation body-building, used by both the manual "New invoice"
// endpoint and the flat/usage "Generate invoice" endpoint, so number sequencing,
// VAT handling, and tenant snapshot fields stay identical across both paths.
export async function createPlatformInvoiceForTenant(
  params: CreatePlatformInvoiceForTenantParams
) {
  const vatRate = Math.max(0, Math.min(params.vatRate ?? 0, 1))
  const subtotal = params.items.reduce((sum, item) => sum + item.lineTotal, 0)
  const vatAmount = subtotal * vatRate
  const total = subtotal + vatAmount

  return createPlatformInvoiceWithNumber(
    (n) => ({
      invoiceNumber: n.number,
      invoiceYear: n.year,
      invoiceSequence: n.sequence,
      status: 'draft',
      subtotal,
      vatRate,
      vatAmount,
      total,
      currency: 'RON',
      vatExemptReason: vatRate === 0 ? PLATFORM_INVOICE_VAT_EXEMPT_REASON : null,
      notes: params.notes ?? null,
      dueDate: params.dueDate ?? null,
      billingPeriod: params.billingPeriod ?? null,
      snapshotTenantName: params.tenant.name,
      snapshotTenantCui: params.tenant.cui ?? null,
      snapshotTenantAddress:
        [params.tenant.addressLine1, params.tenant.city].filter(Boolean).join(', ') || null,
      snapshotTenantEmail: params.tenant.email ?? null,
      tenant: { connect: { id: params.tenant.id } },
      items: {
        create: params.items.map((item, idx) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          sortOrder: idx,
        })),
      },
    }),
    (created) => created
  )
}

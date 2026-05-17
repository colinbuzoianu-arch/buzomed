import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const MAX_RETRIES = 5

export interface NextInvoiceNumberResult {
  year: number
  sequence: number
  number: string // 'YYYY/NNN'
}

export async function computeNextInvoiceNumber(
  tenantId: string,
  year: number = new Date().getUTCFullYear()
): Promise<NextInvoiceNumberResult> {
  const highest = await prisma.invoice.findFirst({
    where: { tenantId, invoiceYear: year },
    orderBy: { invoiceSequence: 'desc' },
    select: { invoiceSequence: true },
  })

  const sequence = (highest?.invoiceSequence ?? 0) + 1
  return {
    year,
    sequence,
    number: `${year}/${String(sequence).padStart(3, '0')}`,
  }
}

export async function createInvoiceWithNumber<T>(
  tenantId: string,
  buildData: (n: NextInvoiceNumberResult) => Prisma.InvoiceCreateInput,
  toReturn: (created: Awaited<ReturnType<typeof prisma.invoice.create>>) => T
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const next = await computeNextInvoiceNumber(tenantId)
    try {
      const created = await prisma.invoice.create({ data: buildData(next) })
      return toReturn(created)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        continue
      }
      throw err
    }
  }
  throw new Error(`Could not allocate invoice number after ${MAX_RETRIES} retries`)
}

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

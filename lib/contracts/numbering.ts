import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const MAX_RETRIES = 5

export interface NextContractNumberResult {
  year: number
  sequence: number
  number: string // 'YYYY/NNN'
}

export async function computeNextContractNumber(
  tenantId: string,
  year: number = new Date().getUTCFullYear()
): Promise<NextContractNumberResult> {
  const highest = await prisma.contract.findFirst({
    where: { tenantId, contractYear: year },
    orderBy: { contractSequence: 'desc' },
    select: { contractSequence: true },
  })

  const sequence = (highest?.contractSequence ?? 0) + 1
  return {
    year,
    sequence,
    number: `${year}/${String(sequence).padStart(3, '0')}`,
  }
}

export async function createContractWithNumber<T>(
  tenantId: string,
  buildData: (n: NextContractNumberResult) => Prisma.ContractCreateInput,
  toReturn: (created: Awaited<ReturnType<typeof prisma.contract.create>>) => T
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const next = await computeNextContractNumber(tenantId)
    try {
      const created = await prisma.contract.create({
        data: buildData(next),
      })
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
  throw new Error(
    `Could not allocate contract number after ${MAX_RETRIES} retries`
  )
}

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Generate the next examination number for a given tenant and year.
 *
 * Format: "YYYY/NNNN" — year + 4-digit zero-padded sequence per tenant
 * per year. Resets every January 1st.
 *
 * Concurrency: the DB has a unique constraint on
 * (tenantId, examinationYear, examinationSequence). Two practitioners
 * scheduling exams at the same instant could both compute the same
 * sequence; the SECOND insert will then fail with a P2002 unique
 * violation. We catch that, recompute, retry — up to N times.
 *
 * In production with low concurrency this is overkill but cheap. With
 * high concurrency the right answer is a sequence per (tenant, year)
 * in Postgres, but that adds DDL and is overkill until cabinets are
 * actually scheduling 100+ exams per hour.
 */

const MAX_RETRIES = 5

export interface NextNumberResult {
  year: number
  sequence: number
  number: string // 'YYYY/NNNN'
}

export async function computeNextExaminationNumber(
  tenantId: string,
  year: number = new Date().getUTCFullYear()
): Promise<NextNumberResult> {
  const highest = await prisma.examination.findFirst({
    where: { tenantId, examinationYear: year },
    orderBy: { examinationSequence: 'desc' },
    select: { examinationSequence: true },
  })

  const sequence = (highest?.examinationSequence ?? 0) + 1
  return {
    year,
    sequence,
    number: `${year}/${String(sequence).padStart(4, '0')}`,
  }
}

/**
 * Helper that wraps a create with retry-on-collision. Pass a builder
 * that takes the computed (year, sequence, number) and returns the
 * `create` data. On P2002 (unique violation on the examination_number
 * index), recompute and retry.
 */
export async function createExaminationWithNumber<T>(
  tenantId: string,
  buildData: (n: NextNumberResult) => Prisma.ExaminationCreateInput,
  toReturn: (created: Awaited<ReturnType<typeof prisma.examination.create>>) => T
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const next = await computeNextExaminationNumber(tenantId)
    try {
      const created = await prisma.examination.create({
        data: buildData(next),
      })
      return toReturn(created)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Unique violation; another writer beat us to this sequence.
        // Loop and recompute.
        continue
      }
      throw err
    }
  }
  throw new Error(
    `Could not allocate examination number after ${MAX_RETRIES} retries (high concurrency?)`
  )
}

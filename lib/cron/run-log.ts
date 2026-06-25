import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function startCronRun(jobName: string): Promise<string> {
  const run = await prisma.cronRun.create({
    data: { jobName, status: 'running' },
    select: { id: true },
  })
  return run.id
}

export async function finishCronRun(
  id: string,
  result: {
    status: 'success' | 'failed'
    itemsProcessed?: number
    errorCount?: number
    summary?: object
    errorMessage?: string
  }
): Promise<void> {
  try {
    await prisma.cronRun.update({
      where: { id },
      data: {
        finishedAt: new Date(),
        status: result.status,
        itemsProcessed: result.itemsProcessed ?? 0,
        errorCount: result.errorCount ?? 0,
        summary: result.summary ? (result.summary as Prisma.InputJsonObject) : undefined,
        errorMessage: result.errorMessage?.slice(0, 1000) ?? null,
      },
    })
  } catch (err) {
    console.error('[cron-run] finish update failed:', err)
  }
}

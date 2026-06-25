import { prisma } from '@/lib/prisma'

interface LogAiUsageParams {
  tenantId?: string | null
  userId?: string | null
  route: string
  model: string
  usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null } | null
  durationMs: number
  success: boolean
  errorMessage?: string
}

export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        route: params.route,
        model: params.model,
        inputTokens: params.usage?.input_tokens ?? 0,
        outputTokens: params.usage?.output_tokens ?? 0,
        cacheReadTokens: params.usage?.cache_read_input_tokens ?? 0,
        durationMs: params.durationMs,
        success: params.success,
        errorMessage: params.errorMessage?.slice(0, 500) ?? null,
      },
    })
  } catch (err) {
    console.error('[ai-usage] log write failed:', err)
  }
}

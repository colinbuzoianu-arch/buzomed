import { prisma } from '@/lib/prisma'
import type { AuditAction } from '@prisma/client'

interface AuditParams {
  tenantId: string | null
  userId: string | null
  action: AuditAction
  entityType: string
  entityId?: string
  entitySummary?: string
  changes?: object
  ipAddress?: string
}

/**
 * Write an audit log entry.
 * Never throws — audit failures must not break the main operation.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLogEntry.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        entitySummary: params.entitySummary ?? null,
        changes: params.changes ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] Failed to write audit log entry:', err)
  }
}

/**
 * Extract client IP from Next.js request headers.
 * Handles X-Forwarded-For (proxy/Vercel) and falls back to undefined.
 */
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return undefined
}

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
  userAgent?: string
  sessionId?: string
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
        userAgent: params.userAgent ?? null,
        sessionId: params.sessionId ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] Failed to write audit log entry:', err)
  }
}

/**
 * Extract client IP and User-Agent from Next.js request headers.
 * Handles X-Forwarded-For (proxy/Vercel).
 */
export function getRequestMeta(request: Request): { ipAddress?: string; userAgent?: string } {
  const forwarded = request.headers.get('x-forwarded-for')
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : undefined
  const userAgent = request.headers.get('user-agent') ?? undefined
  return { ipAddress, userAgent }
}

/** @deprecated Use getRequestMeta instead */
export function getClientIp(request: Request): string | undefined {
  return getRequestMeta(request).ipAddress
}

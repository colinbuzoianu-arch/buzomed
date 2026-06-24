import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

export async function getApiUserFromKey(
  request: NextRequest
): Promise<{ tenantId: string; scopes: string[]; keyId: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer bz_live_')) return null

  const raw = authHeader.slice(7)
  const hash = createHash('sha256').update(raw).digest('hex')

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, tenantId: true, scopes: true, revokedAt: true, expiresAt: true },
  })
  if (!key) return null
  if (key.revokedAt) return null
  if (key.expiresAt && key.expiresAt < new Date()) return null

  void prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return { tenantId: key.tenantId, scopes: key.scopes, keyId: key.id }
}

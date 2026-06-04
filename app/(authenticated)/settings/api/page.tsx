import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ApiSettingsClient } from './api-settings-client'

export const metadata = { title: 'API & Webhooks — Buzomed' }

export default async function ApiSettingsPage() {
  const user = await requireUser()

  if (!user.tenantId || !user.roles.includes('practice_admin')) {
    redirect('/dashboard')
  }

  const [rawKeys, rawEndpoints] = await Promise.all([
    prisma.apiKey.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.webhookEndpoint.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        secretPrefix: true,
        isActive: true,
        lastTriggeredAt: true,
        failureCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Serialize dates for client component
  const keys = rawKeys.map((k) => ({
    ...k,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }))

  const endpoints = rawEndpoints.map((e) => ({
    ...e,
    lastTriggeredAt: e.lastTriggeredAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API &amp; Webhooks</h1>
        <p className="text-muted-foreground mt-1">
          Gestionează cheile API și endpoint-urile webhook pentru integrări externe.
        </p>
      </div>
      <ApiSettingsClient keys={keys} endpoints={endpoints} />
    </div>
  )
}
